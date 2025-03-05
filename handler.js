require('dotenv').config();
const AWS = require("aws-sdk");
const { v4: uuidv4 } = require("uuid");
const Minio = require('minio');
const parseMultiPart = require('aws-lambda-multipart-parser');
const { createCanvas, loadImage } = require("canvas");
const path = require('path');

console.log(process.env.MINIO_ENDPOINT)

const minioClient =  new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT,
  port: parseInt(process.env.MINIO_PORT),
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY,
});

const dynamoDb = new AWS.DynamoDB.DocumentClient(
  process.env.IS_OFFLINE && {
    region: "localhost",
    endpoint: "http://localhost:8000",
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
);

const bucketName = process.env.MINIO_BUCKET;

// Vérifier si le bucket existe, sinon le créer
(async () => {
  const exists = await minioClient.bucketExists(process.env.MINIO_BUCKET)
  if (exists) {
      console.log('Bucket exists.')
    } else {
      console.log('Bucket created.')
      await minioClient.makeBucket(process.env.MINIO_BUCKET, 'us-east-1')
  }
})();

const TABLE_NAME = process.env.DYNAMODB_TABLE;

exports.index = async (event) => {
  return {
    statusCode: 404,
    body: JSON.stringify({
      message: "Url Shortener v1.0",
    }),
  };
};

async function createMeme(imageBuffer, topText, bottomText) {
    const img = await loadImage(imageBuffer);
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext("2d");

    ctx.drawImage(img, 0, 0);
    ctx.fillStyle = "white";
    ctx.font = "bold 40px Arial";
    ctx.textAlign = "center";

    ctx.fillText(topText, img.width / 2, 50);
    ctx.fillText(bottomText, img.width / 2, img.height - 20);

    return canvas.toBuffer();
}

exports.uploadMeme = async (event) => {

  // Check if the event is base64 encoded
  const bodyBuffer = event.isBase64Encoded ? Buffer.from(event.body, 'base64') : Buffer.from(event.body);
  const result = parseMultiPart.parse({ ...event, body: bodyBuffer.toString('binary') }, true);

  // Process the parsed data
  const memeTextTop = result.memeTextTop;
  const memeTextBottom = result.memeTextBottom;
  const file = result.file;
  const fileName = file.filename;
  file.content = await createMeme(file.content, memeTextTop, memeTextBottom); 
  // const fileExtension = path.extname(fileName); // Obtenir l'extension (ex. .jpg, .png)
  const key =  uuidv4();

  const response = await minioClient.putObject(bucketName, key, Buffer.from(file.content, 'base64'));

  const params = {
    TableName: TABLE_NAME,
    Item: {
      key,
      fileName,
      createdAt: new Date().toISOString()
    },
  };

  try {
    console.log("Insertion DynamoDB : ", params);
    await dynamoDb.put(params).promise();
    console.log("Insertion réussie !");
  } catch (error) {
      console.error("Erreur DynamoDB : ", error);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: "VOUS AVEZ ECHOUE AVEC SUCCESS",
    })
  };
};

exports.downloadMeme = async (event) => {
  const { key } = event.pathParameters;

  const params = {
    TableName: TABLE_NAME,
    Key: {
      key,
    },
  };

  const { Item } = await dynamoDb.get(params).promise();

  if (!Item) {
    return {
      statusCode: 404,
      body: JSON.stringify({ message: 'File not found' }),
    };
  }

  const headers = {
    'Content-Disposition': `attachment; filename="${Item.fileName}"`,
    'Content-Type': 'image/jpeg',
  };

  // Utiliser le flux pour répondre avec le fichier
  const stream = await minioClient.getObject(bucketName, key);

  // Collecter les données du stream
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }

  // Combine all chunks into a buffer
  const fileBuffer = Buffer.concat(chunks);

  // Convert the fileBuffer to base64
  const base64Image = fileBuffer.toString('base64');

  return {
    statusCode: 200,
    headers,
    body: base64Image, // Image in base64 format
    isBase64Encoded: true, // Flag to indicate the body is base64 encoded
  };
};

exports.createUrl = async (event) => {
  const { url } = JSON.parse(event.body);
  const key = uuidv4().slice(0, 8);

  const params = {
    TableName: TABLE_NAME,
    Item: {
      key,
      url,
      createdAt: new Date().toISOString(),
      clicks: 0,
    },
  };

  await dynamoDb.put(params).promise();

  return {
    statusCode: 200,
    body: JSON.stringify({ key, shortUrl: `http://localhost:3000/url/${key}` }),
  };
};

exports.listImages = async (event) => {
  const params = {
    TableName: TABLE_NAME,
  };

  const { Items } = await dynamoDb.scan(params).promise();

  return {
    statusCode: 200,
    body: JSON.stringify(Items),
  };
};