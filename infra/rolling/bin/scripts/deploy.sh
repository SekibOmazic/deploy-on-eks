#!/usr/bin/env bash

GREEN="\033[1;32m"

echo -e "${GREEN}Exporting github repo name and owner ...."
export GITHUB_REPO_OWNER=SekibOmazic
export GITHUB_REPO_NAME=deploy-on-eks

echo -e "${GREEN}Exporting DockerHub credentials ...."
export DOCKERHUB_USERNAME=sekibomazic
export DOCKERHUB_PASSWORD=eY3Qu6#u#su6E*H

echo -e "${GREEN}Exporting api name ...."
export API_NAME=simple-api

echo -e "${GREEN}Start building the EKS stack resources and the pipeline ...."
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export AWS_DEFAULT_REGION=$(aws configure get region)

cdk bootstrap aws://$AWS_ACCOUNT_ID/$AWS_DEFAULT_REGION

cdk --app "npx ts-node bin/rolling.ts" deploy --all --require-approval never

echo -e "${GREEN}Completed building the EKS stack and CiCd pipeline ...."
