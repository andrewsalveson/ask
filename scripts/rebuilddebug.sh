sudo bash ./build.sh $1 $2
sudo docker stop $2
sudo docker rm $2
sudo bash ./rundebug.sh $1 $2 $3 $4