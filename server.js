var http = require('http');

var handleRequest = function(request, response) {
  console.log('Received request for URL: ' + request.url);
  response.writeHead(200);
  response.end('And the pre-configured environment-based response is: ' + process.env.response);
};

var www = http.createServer(handleRequest);
www.listen(8080);
