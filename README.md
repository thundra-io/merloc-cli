# MerLoc CLI

![Build Status](https://github.com/thundra-io/merloc-local/actions/workflows/build.yml/badge.svg)
![NPM Version](https://badge.fury.io/js/merloc-local.svg)
![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)

**MerLoc** is a live AWS Lambda function development and debugging tool.
MerLoc allows you to run AWS Lambda functions on your local while they are still part of a flow in the AWS cloud remote.

**MerLoc CLI** is a client side CLI tool to run AWS Lambda functions on your local.
It communicates with **MerLoc GateKeeper** in AWS Lambda function over **MerLoc Broker** 
for receiving invocations, executing function locally and then returning response to AWS Lambda service.

## Features

### Local Run

MerLoc allows you to run AWS Lambda functions locally (by forwarding invocations to your local) 
in their own local isolated sandbox environments (like Docker container) with the invocation from real AWS Lambda environment.
So you don't need to prepare sample inputs to invoke your AWS Lambda functions while running and testing locally.

After the invocation, MerLoc also returns your response to the caller of your AWS Lambda function 
(by returning local responses back to the real AWS Lambda function).
So this means that nothing is changed from the AWS Lambda function client/caller perspective. 
It still invokes the target AWS Lambda function with the request and gets the response.
But with MerLoc, the AWS Lambda function is run locally by still being as part of a flow in the AWS cloud.

Additionally, MerLoc propagates IAM credentials from the real AWS Lambda environment to your local
so your local function runs with the same credentials.
So this means that you can also test and verify IAM permission issues on your local.

### Breakpoint Debugging

MerLoc supports debugging AWS Lambda functions locally by putting breakpoints and evaluating expressions from your IDE. 
MerLoc provides classical local debugging experience for your AWS Lambda functions.
So you don't need to add print statements around the code, repackage and redeploy the function for debugging. 

Another cool debugging feature is that you can debug multiple AWS Lambda functions on your local at the same time.
Because, with the help of MerLoc, each locally running function can have its own debug session.
So you can debug different functions at the same time by starting individual debug sessions from your IDE.

### Hot-Reload

Another useful feature is hot-reloading AWS Lambda functions.
So you can apply your changes to AWS Lambda function live without need to deploy it.

MerLoc watches your local changes and if there is any change which effects function's behaviour, 
it automatically rebuilds and restarts the function locally. 

The use case for this cool feature is that while you are developing an AWS Lambda function on local, 
you don't need to repackage and redeploy to the AWS Lambda environment after every change.
Instead, MerLoc allows you to focus on developing function, 
and it manages lifecycle and provisioning the local function you are developing 
to improve your productivity by preventing you from wasting your time with unnecessary deployments.

## Prerequisites
- Node.js 14+
- Docker

## Pre-Setup

First, you need to setup MerLoc **Broker** and **GateKeeper** components:

1) [Setup](https://github.com/thundra-io/merloc) MerLoc **Broker** to your AWS account

2) [Setup](https://github.com/thundra-io/merloc-gatekeeper-aws-lambda-extension) MerLoc **GateKeeper** to your AWS Lambda function

## Setup

```
npm install -g merloc-local
```

After install, check whether it is installed successfully:
```
merloc --version
```
By this command, you should see the installed version number if everything is installed properly.

## How to Run

**MerLoc CLI** (`merloc` command) must be run in your serverless project root directory,
so it can use the integrated tool (`AWS SAM`, `Serverless Framework`, ...) to run function locally.

## Configuration

- `-b <url>` (or `--broker-url <url>`): Configures URL of the **MerLoc Broker** 
  which has been set up [before](https://github.com/thundra-io/merloc). 
  This configuration is **MANDATORY**.
  For example:
  ```
  merloc -b wss://a1b2c3d4e5.execute-api.us-west-2.amazonaws.com/dev
  ```  

- `-c <name>` (or `--connection-name <name>`): Configures name of the connection to the **MerLoc Broker**
  This configuration is **OPTIONAL**. The default value is `default`. 
  Connection with name `default` matches with all **MerLoc GateKeeper** connections 
  if there is no another local connection with the function name 
  (or connection name set by `MERLOC_BROKER_CONNECTION_NAME` at **MerLoc GateKeeper**) specifically.
  For example:
  ```
  merloc -b wss://a1b2c3d4e5.execute-api.us-west-2.amazonaws.com/dev -c my-connection
  ```  
  
- `-a <key>` (or `--api-key <key>`): Configures API key for authorization while connecting to **MerLoc Broker**.
  This configuration is **OPTIONAL**. If API key is specified, it must match the API key set at AWS Lambda function 
  (by `MERLOC_APIKEY` or `THUNDRA_APIKEY` environment variable) to pair the connections by the **MerLoc Broker**.
  For example:
  ```
  merloc -b wss://a1b2c3d4e5.execute-api.us-west-2.amazonaws.com/dev -a 1234-5678-90
  ```  

- `-i <name>` (or `--invoker <name>`):
  This configuration is **OPTIONAL** (but it is highly recommended to be set according to integrated tool). 
  The default value is `auto`.
  Valid values are:
  - `auto`: Automatically decides invoker to be used (`sam-local` or `serverless-local`). 
    Decision is taken based on project structure:
    - If there is `template.yml` in the project root directory, `sam-local` invoker is used.
    - If there is `serverless.yml` in the project root directory, `serverless-local` invoker is used.
    - Otherwise, terminates **MerLoc CLI** with error as invoker to be used couldn't be determined. 
  - `sam-local`: Uses **AWS SAM** local to run and debug function locally. 
    To use this option, the project must be a valid **AWS SAM** project.
  - `serverless-local`: Uses **Serverless** local to run and debug function locally. 
    To use this option, the project must be a valid **Serverless framework** project.
  For example:
  ```
  merloc -b wss://a1b2c3d4e5.execute-api.us-west-2.amazonaws.com/dev -i sam-local
  ```  

- `-d` (or `--debug`): Enables breakpoint debugging (if supported for the function runtime by **MerLoc**). 
  By default breakpoint debugging is disabled.
  For example:
  ```
  merloc -b wss://a1b2c3d4e5.execute-api.us-west-2.amazonaws.com/dev -d
  ```  
  
- `-r` (or `--reload`): Enables hot-reloading (if supported for the function runtime by **MerLoc**).
  This configuration is **OPTIONAL**. By default, hot-reloading is disabled.
  For example:
  ```
  merloc -b wss://a1b2c3d4e5.execute-api.us-west-2.amazonaws.com/dev -r
  ```  
  **Note:** Hot-reload can also be triggered manually by pressing `Ctrl+R`.

- `-w <paths...>` (or `--watch <paths...>`): Configures paths to files, directories or **glob** patterns 
  to be watched for changes to trigger hot-reload automatically.
  Enabling hot-reload (by `-r` or `--reload` as mentioned above) is required to use this option.
  This configuration is **OPTIONAL**. By default, current directory is watched.
  For example:
  ```
  merloc -b wss://a1b2c3d4e5.execute-api.us-west-2.amazonaws.com/dev -r -w '**/*.ts' '**/*.js'
  ```  
  **Note:**
  The following file patterns are ignored from being watched:
  - `'**/.idea/**'`
  - `**/.vscode/**'`
  - `**/.github/**'`
  - `**/.serverless/**'`
  - `**/.aws-sam/**'`
  - `**/.build/**'`
  - `**/.*'`
  - `**/*.json'`
  - `**/*.yml'`
  - `**/*.md'`
  - `**/*.txt'`
  - `**/LICENSE'`

- `-rc <mode>` (or `--runtime-concurrency <mode>`): Configures concurrency level at runtime level globally.
  This configuration is **OPTIONAL**. The default value is `reject`.
  Valid values are:
  - `reject`: Rejects any invocation from any function if local runtime is busy executing other invocation.
    In this case, **MerLoc GateKeeper** is informed by local runtime with the rejection
    and then GateKeeper forwards the request to the original user handler.
  - `wait`: Waits any invocation from any function until runtime is available
    if local runtime is busy executing another invocation.
  - `per-function`: Disables global lock between functions and runtime lock is handled at per function basis
    according to `-fc <mode>` (or `--function-concurrency <mode>`) configuration mentioned below.
  For example,
  ```
  merloc -b wss://a1b2c3d4e5.execute-api.us-west-2.amazonaws.com/dev -rc per-function
  ```

- `-fc <mode>` (or `--function-concurrency <mode>`): Configures concurrency level at function level 
  so executing a function doesn't block executing another function.
  This configuration is **OPTIONAL**. The default value is `reject`.
  Valid values are:
  - `reject`: Rejects an invocation from a function if local runtime is busy executing other invocation of that function.
    In this case, **MerLoc GateKeeper** is informed by local runtime with the rejection
    and then GateKeeper forwards the request to the original user handler.
  - `wait`: Waits an invocation from a function until runtime is available
    if local runtime is busy executing another invocation of that function.
      
  For example,
  ```
  merloc -b wss://a1b2c3d4e5.execute-api.us-west-2.amazonaws.com/dev -fc wait
  ```

- `-v` (or `--verbose`): Enables verbose mode to print internal logs of the **MerLoc CLI**.
  For example:
  ```
  merloc -b wss://a1b2c3d4e5.execute-api.us-west-2.amazonaws.com/dev -v
  ```

- `-version`: Prints version of the currently installed **MerLoc CLI**.
  For example:
  ```
  merloc --version
  ```

- `-h` (`--help`): Displays help for **MerLoc CLI**. 
  For example:
  ```
  merloc -h
  ```

## Integrations

### AWS SAM

**MerLoc CLI** (`merloc` command) must be run in your **AWS SAM** project root directory where `template.yml` file is located.

Go to [AWS SAM](./doc/AWS-SAM.md) page for the details.

### Serverless Framework

**MerLoc CLI** (`merloc` command) must be run in your **Serverless Framework** project root directory where `serverless.yml` file is located.

[Serverless Framework](./doc/Serverless-Framework.md) page for the details.

## Troubleshooting

- If you see the following error message
  ```
  ERROR - <index> Unable to connect to broker: Error: Unexpected server response: 403
  ```
  while connecting broker, this means that,
  - either your broker requires an API key (for ex, you are using Thundra hosted broker) 
    and you didn't provide an API key by `-a <api-key>` option
  - or the API key you provided is invalid

## Issues and Feedback

[![Issues](https://img.shields.io/github/issues/thundra-io/merloc-local.svg)](https://github.com/thundra-io/merloc-local/issues?q=is%3Aopen+is%3Aissue)
[![Closed issues](https://img.shields.io/github/issues-closed/thundra-io/merloc-local.svg)](https://github.com/thundra-io/merloc-local/issues?q=is%3Aissue+is%3Aclosed)

Please use [GitHub Issues](https://github.com/thundra-io/merloc-local/issues) for any bug report, feature request and support.

## Contribution

[![Pull requests](https://img.shields.io/github/issues-pr/thundra-io/merloc-local.svg)](https://github.com/thundra-io/merloc-local/pulls?q=is%3Aopen+is%3Apr)
[![Closed pull requests](https://img.shields.io/github/issues-pr-closed/thundra-io/merloc-local.svg)](https://github.com/thundra-io/merloc-local/pulls?q=is%3Apr+is%3Aclosed)
[![Contributors](https://img.shields.io/github/contributors/thundra-io/merloc-local.svg)]()

If you would like to contribute, please
- Fork the repository on GitHub and clone your fork.
- Create a branch for your changes and make your changes on it.
- Send a pull request by explaining clearly what is your contribution.

> Tip:
> Please check the existing pull requests for similar contributions and
> consider submit an issue to discuss the proposed feature before writing code.

## License

Licensed under [Apache License 2.0](LICENSE).
