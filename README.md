`npm run build`

git push


```
docker login ghcr.io -u miguel-abulencia
```
Enter PAT as password

```
docker pull ghcr.io/miguel-abulencia/arabidopsis-reactjs:sha-056d6bb
docker run -d -p 3000:80 --name arabidopsis-container arabidopsis-app
```