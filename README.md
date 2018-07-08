In this exercise, I mixed a couple of tutorials together from the Kubernetes site to demo the following:
- deploying an app that has pre-configured env vars
- leveraging those env vars in application code
- updating the env vars on the server
- running a fresh rollout to demo the updated env vars in action

The idea is to demonstrate how to push out updates to environment variables (or, for that matter, secret keys) to a Kubernetes deployment.

## Prerequisites/Assumptions

If you're reading this, I'm assuming you have a Kubernetes cluster set up and ready for action, and the `kubectl` CLI installed and pointing to said cluster.  I'm doing all of this locally on my Mac, so I'm using `minikube`.  

If you're looking for how to do all of that check out this action: https://kubernetes.io/docs/tasks/tools/install-minikube/

## Steps:

### Create an image from a Node application file

I have a very simple `server.js` file includes code to pull from `process.env` in building a request response, so this was a good use case for demoing env vars.  
```
// server.js

var http = require('http');

var handleRequest = function(request, response) {
  console.log('Received request for URL: ' + request.url);
  response.writeHead(200);
  response.end('And the pre-configured environment-based response is: ' + process.env.response);
};

var www = http.createServer(handleRequest);
www.listen(8080);
```

In order to use it though, I'd have to build it into a local image so that I can put together a deployment.  So let's write up a Dockerfile:
```
# Dockerfile

FROM node:latest
EXPOSE 8080
COPY server.js .
CMD node server.js
```

Nice.  Now, from the directory where they live, we'll run the following to make the build *come alive!*
```
$ docker build -t node-env-test:v1 .
```

If the console output was successful, and we run this command...
```
$ docker image
```
...we should see a image called `node-env-test` in our list of images.

### Create a config map from an env file

Now is where it gets fun.  I had to put together a Kubernetes `configmap` stored on the server that my deployment could reference.  I have the `demo-env.properties` file ready to go
```
# demo-env.properties

response='I am the Bullgod'
```
So I followed the instructions listed in (the config map tutorial)[https://kubernetes.io/docs/tasks/configure-pod-container/configure-pod-configmap/#create-a-configmap] to create a config map from that file:
```
$ kubectl create configmap demo-env --from-env-file='./demo-env.properties'
```

We can make sure that it worked by running the `get` command on the newly created resource:
```
$ kubectl get configmap demo-env -o yaml
```
In the list of stuff, we should see something like:
```
# some other stuff in the yaml output...
# ...
data:
  response: '''I am the Bullgod'''
# and the rest of the stuff in the yaml output...
# ...  
```

### Create and expose a deployment that references the new config map

My deployment declaration - `node-env-test-deployment.yaml` - was an effort that combined steps from the (deployment creation tutorial)[https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#creating-a-deployment] and the syntax specified in the config map tutorial for (using all env vars within a pod)[https://kubernetes.io/docs/tasks/configure-pod-container/configure-pod-configmap/#configure-all-key-value-pairs-in-a-configmap-as-pod-environment-variables].  
```
# node-env-test-deployment.yaml

apiVersion: apps/v1
kind: Deployment
metadata:
  name: node-env-test-deployment
  labels:
    app: node-env-test
spec:
  replicas: 3
  selector:
    matchLabels:
      app: node-env-test
  template:
    metadata:
      labels:
        app: node-env-test
    spec:
      containers:
        - name: node-env-test
          image: node-env-test:v2
          ports:
            - containerPort: 8080
          envFrom:
            - configMapRef:
                 name: demo-env  # <-- BOOMSHAKALAKA!!!
```

With that file created, I run the deployment:
```
$ kubectl create -f ./node-env-test-deployment.yaml
```

Once it's running, I create a simple service to expose it:
```
$ kubectl expose deployment node-env-test-deployment --type=LoadBalancer
```

**At this point, I can access my deployed image, and see that the application is indeed responding with environment-based data**
```
# launch a browser pointing to the exposed deployment service
$ minikube service node-env-test-deployment
```

### Update environment variables in the server's config map

Ok, doing great.  So now I need to update the environment variables stored on the server, so that I can redeploy my app with a new message.

In order to do that, I'll need to save my existing config map to the local file system so that I can revise it and send it to the server:
```
$ kubectl get configmap demo-env -o yaml > demo-env-revised.yaml
```

Now I have a file that contains the actual server definition of the `demo-env` config map.  It has the properties that I set up, plus a bunch of server-defined properties that we can ignore.

I'll update the `data.response` field in `demo-env-revised.yaml` to show a new string:
```
# demo-env-revised.yaml

# some other stuff in the yaml file...
# ...
data:
  response: '''For science, you monster'''
# and the rest of the stuff in the yaml file...
# ...  
```

And now I'll apply these changes to the deployed config map.  Note that I don't have to declare the config map that I'm overwriting, as it's in the `metadata.name` property of the yaml file.
```
$ kubectl apply -f demo-env-revised.yaml
```

To make sure that worked, I can run a `get` on that file to make sure I see the output I want:
```
$ kubectl get configmap demo-env -o yaml
# ...output should show the right value in the data.response field
```

### Restart the pods in the deployment

At this point my environment variables have been updated, but the app image was launched with the previous env vars.  So in order to see the updated message in my browser, I'll need to redeploy my app.
```
$ kubectl apply -f node-env-test-deployment.yaml
```

Note that at the time of this writing, there's no clean way to restart pods in a deployment without some sort of workaround:
- https://github.com/kubernetes/kubernetes/issues/27081
- https://github.com/kubernetes/kubernetes/issues/13488

**Finally, as my pods are redeployed, I can see the new message show up when I refresh my browser**
