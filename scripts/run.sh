sudo docker run -dti \
  -p $4:$4 \
  --link mongo:mongo \
  --link neo4j:neo4j \
  --env NODE_ENV=$3 \
  --name $2 \
  $1/$2
