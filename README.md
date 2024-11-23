# Keda

## Description

Deployment made using a combination of Helm and Kustomize to deploy Keda and
a dummy Deployment which is scaled depending on the size of a Redis queue.

## Steps

1. Execute the following command to deploy Keda

    ```
    helm dependency update ./000-operator
    helm upgrade --install keda ./000-operator --namespace keda --create-namespace
    ```

2. Execute the following command to deploy Redis

   > DISCLAIMER: included Redis is not intended for production. 
   > In that case, Sentinel or cluster is needed.

   ```
   helm dependency update ./001-dummy-redis
   helm upgrade --install redis ./001-dummy-redis --namespace application --create-namespace
   ```

3. Execute the following command to deploy a dummy application with a scaler triggered by Redis queue size

   ```
   kubectl apply -k ./002-dummy-deployment
   ```

 ## Test Redis Autoscaler

 1. Install redis-cli

   ```
   brew install redis
   ```

 2. Connect Redis # get the redis master service ip and port

   ```
   redis-cli -a $(kubectl get secrets -n application redis -o jsonpath="{.data.redis-password}" | base64 --decode) -h $(kubectl get service redis-master -n application -o jsonpath='{.spec.clusterIP}') -p $(kubectl get service redis-master -n application -o jsonpath='{.spec.ports[0].port}')
   ```
    
 3. Watch # in split tab run:

   ```
   Kubectl get pods -w
   ```

 4. Send test message to queue to scale # after 3 message you will se one more replica

   ```
   LPUSH mylist uno
   LPUSH mylist uno
   LPUSH mylist uno
   LPUSH mylist uno
   ```   

 ## Test mysql Autoscaler

 1. Build 

   ```
   cd 
   docker build -t local/app .
   docker build -t local/dummy -f dummy.Dockerfile .
   ```

 2. Install mysql instance and dummy app to scale 

   ```
   kubectl apply -f deployment/
   ```

 3. Install mysql scaler

   ```
   kubectl apply -f keda/mysql-hpa.yaml
   ```      

 4. scale up

   ```
   kubectl exec $(kubectl get pods | grep "server" | cut -f 1 -d " ") -- keda-talk mysql insert
   ```

 5. scale down

   ```
   kubectl exec $(kubectl get pods | grep "server" | cut -f 1 -d " ") -- keda-talk mysql delete
   ``` 