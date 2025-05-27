# Quick Start Guide: Local Deployment of the Arabidopsis Web App
This guide walks you through how to run the containerized version of the web application on a new local computer.


## 1. Download and Install Docker Desktop
Download the Docker Desktop installer that matches your operating system from the official Docker website:

https://www.docker.com/products/docker-desktop/

After downloading, run the installer and follow the setup instructions. Once installed, make sure Docker Desktop is running—you should see the Docker icon in your system tray or menu bar.

## 2. Pull docker container
Use the command below to download the container image from the GitHub Container Registry:
```
docker pull ghcr.io/miguel-abulencia/arabidopsis-reactjs:sha-056d6bb
```

## 3. Run the docker container
Start the container using the following command:
```
docker run -d -p 3000:80 --name arabidopsis-container ghcr.io/miguel-abulencia/arabidopsis-reactjs
```
-  `-d` runs the container in the background

- `-p 3000:80` maps your local port 3000 to the container’s port 80

- `--name` gives the container a readable name


## 4. View the Web App
Once the container is running, open your web browser and navigate to:
```
http://localhost:3000
```