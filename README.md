# deploy-on-eks

Simple CICD Pipeline for EKS

## Build from source

1. Clone the repo

   ```sh
   git clone https://github.com/SekibOmazic/deploy-on-eks.git
   cd deploy-on-eks
   ```

2. Install dependencies and build

   ```sh
   npm install
   npm run build
   ```

3. Run the server.
   ```sh
   npm start
   ```

## Build Docker image locally

```sh
docker build -t deploy-on-eks .
docker run -it -p 80:80 --rm deploy-on-eks:latest
```

## Deploy on EKS

```
cd infra/rolling
npm i
npm run build
cdk deploy
```
