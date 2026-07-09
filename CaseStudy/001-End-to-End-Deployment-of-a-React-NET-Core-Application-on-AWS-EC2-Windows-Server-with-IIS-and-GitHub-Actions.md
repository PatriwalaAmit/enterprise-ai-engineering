# From Zero to Production: Deploying a React + ASP.NET Core Application on AWS EC2 Windows Server Using IIS & GitHub Actions

## Enterprise Deployment Journey with Real Problems and Real Solutions

# Background

A customer wanted to migrate a modern application stack to AWS.

## Technology Stack

Frontend
React 19
Vite
TypeScript

Backend
ASP.NET Core 9
REST API

Database
SQL Server

Authentication
Microsoft Entra ID (Azure AD)

Infrastructure
AWS EC2 Windows Server

Web Server
IIS

Source Control
GitHub

CI/CD
GitHub Actions
Self Hosted Runner

## Initial Requirements

The customer already had https://abc.com running (.net core MVC application).

The new requirement was set up dev environment https://dev.abc.com which should host React Frontend + ASP.NET Core Backend with automatic deployment, GitHub Actions, self hosted runner and Windows IIS.

## PHASE 1 – Prepare EC2

### Step 1 Install Required Software

Install:

Git
Node.js 22 LTS
.NET SDK 9
.NET Hosting Bundle
IIS
IIS URL Rewrite Module
Visual Studio Build Tools (optional)

Verify:

git --version

node -v

npm -v

dotnet --version


