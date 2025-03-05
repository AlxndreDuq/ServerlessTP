## ServerlessTP

## Explication du projet :

A partir de l'envoie d'une photo et de texte, on créer un même. Il peut y avoir un texte haut qui se trouvera en haut de l'image et un texte bas qui se trouvera en bas de l'image

 Instructions d’installation et d’exécution :

 Prérequis :
- Node.js installed
- Serverless Framework installed (`npm install -g serverless`)

## Starting the Project Locally

To run the project locally using serverless-offline, use the following command:

```bash
serverless offline start --reloadHandler
```
The API will be available at `http://localhost:3000` by default.

##  Exemples d’appels API

POST :
![alt text](image.png)

Pour télécharger un fichier précédemment stocké :

GET : http://localhost:3000/dev/download/{:id}