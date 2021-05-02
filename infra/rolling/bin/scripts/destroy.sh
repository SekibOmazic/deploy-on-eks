#!/usr/bin/env bash

GREEN="\033[1;32m"

echo -e "${GREEN}Start cleanup..."
export GITHUB_REPO_OWNER=SekibOmazic
export GITHUB_REPO_NAME=deploy-on-eks
export DOCKERHUB_USERNAME=sekibomazic
export DOCKERHUB_PASSWORD=eY3Qu6#u#su6E*H
export API_NAME=simple-api

export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export AWS_DEFAULT_REGION=$(aws configure get region)

cdk bootstrap aws://$AWS_ACCOUNT_ID/$AWS_DEFAULT_REGION

cdk --app "npx ts-node bin/rolling.ts" destroy --all --require-approval never

echo -e "${GREEN}Cleanup complete"
