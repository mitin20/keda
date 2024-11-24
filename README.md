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
   cd 004-mysql
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

 ## Test request Autoscaler

 1. Install pre-requisites traefik - prometheous - k6 - app

   ```
   cd 005-http_request-prometheus
   ## traefik
   helm repo add traefik \
      https://helm.traefik.io/traefik

   helm repo update

   helm upgrade --install traefik traefik/traefik \
      --namespace traefik --create-namespace --wait

   export INGRESS_HOST=$(kubectl --namespace traefik \
      get svc traefik \
      --output jsonpath="{.status.loadBalancer.ingress[0].ip}")

   echo $INGRESS_HOST      
   
   ## k6
   git clone https://github.com/vfarcic/keda-demo

   yq --inplace \
      ".spec.rules[0].host = \"dot.$INGRESS_HOST.nip.io\"" \
      k8s/ing.yaml

   cat k6.js \
      | sed -e "s@http\.get.*@http\.get('http://dot.$INGRESS_HOST.nip.io');@g" \
      | tee k6.js

   cat k6-100.js \
      | sed -e "s@http\.get.*@http\.get('http://dot.$INGRESS_HOST.nip.io');@g" \
      | tee k6-100.js

   ## app - prometheus

   kubectl create namespace production

   kubectl --namespace production \
      apply --filename k8s/

   helm repo add prometheus-community \
      https://prometheus-community.github.io/helm-charts

   helm repo update

   helm upgrade --install \
      prometheus prometheus-community/prometheus \
      --namespace monitoring \
      --create-namespace \
      --wait      

   ```

 2. Install keda-prometheous scaledobjects

   ```
   kubectl --namespace production \
    get pods

   cat keda-prom.yaml

   kubectl --namespace production apply \
      --filename keda-prom.yaml
   ```

 3. Scale up

   ```
   k6 run k6.js

   kubectl --namespace production \
      get pods,hpa,scaledobjects

   k6 run k6-100.js

   kubectl --namespace production \
      get pods,hpa,scaledobjects
   ```

 ## Test container cpu Autoscaler

 1. Install pre-requisites traefik - prometheous - k6 - app

```
   ## Deploy app and scalesopject
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: nginx-pod
  labels:
    app: nginx
spec:
  containers:
  - name: nginx
    image: nginx:latest
    ports:
    - containerPort: 80
    resources:
      requests:
        memory: "64Mi"
        cpu: "250m"
      limits:
        memory: "128Mi"
        cpu: "500m"    
EOF

cat <<EOF | kubectl apply -f -
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: cpu-scaledobject
  namespace: default
spec:
  scaleTargetRef:
    name: my-deployment
  triggers:
  - type: cpu
    metricType: Utilization # Allowed types are 'Utilization' or 'AverageValue'
    metadata:
      value: "50"
      containerName: "nginx"
EOF

kubectl -n default port-forward nginx-pod 8085:80 >/dev/null 2>&1 &

cat <<EOF | k6 run -
import http from 'k6/http';
import { sleep } from 'k6';

export const options = {
  vus: 100,
  duration: '60s',
};

export default function () {
  http.get('http://localhost:8085');
  sleep(1);
}
EOF
```   