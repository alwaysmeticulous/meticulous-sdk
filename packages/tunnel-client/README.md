# Meticulous secure tunnels client


Localtunnel client for creating secure reverse proxy tunnels to locally hosted services using the Meticulous tunnels service.


This package is a heavily modified version of the [localtunnel client](https://github.com/localtunnel/localtunnel), 
forked from [1f47bd6](https://github.com/localtunnel/localtunnel/commit/1f47bd6ae7a6cb71974b50fe9188b3884aff5789). 

A lot of the modifications are to make the client work with the secure Meticulous tunnels service so this client is not compatible with the original localtunnel service.

## Usage

You can use this via the CLI:

```bash
npx @alwaysmeticulous/cli start-local-tunnel -p 8080 --apiToken <your-api-token>
```
