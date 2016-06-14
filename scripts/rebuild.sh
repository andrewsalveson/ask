sudo bash ./build.sh
sudo docker stop $2
sudo docker rm $2
sudo bash ./run.sh $1 $2 $3 $4
