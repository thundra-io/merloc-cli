# MerLoc - AWS SAM

## Supported Runtimes

| Runtime         |     Local Run      |    Breakpoint Debugging    |     Hot-Reload     |
|-----------------|:------------------:|:--------------------------:|:------------------:|
| `nodejs12.x`    | :white_check_mark: |     :white_check_mark:     | :white_check_mark: |
| `nodejs14.x`    | :white_check_mark: |     :white_check_mark:     | :white_check_mark: |
| `nodejs16.x`    | :white_check_mark: |     :white_check_mark:     | :white_check_mark: |
| `python3.7`     | :white_check_mark: | :eight_pointed_black_star: | :white_check_mark: |
| `python3.8`     | :white_check_mark: | :eight_pointed_black_star: | :white_check_mark: |
| `python3.9`     | :white_check_mark: | :eight_pointed_black_star: | :white_check_mark: |
| `java8`         |        :x:         |            :x:             |        :x:         |
| `java8.al2`     | :white_check_mark: |     :white_check_mark:     | :white_check_mark: |
| `java11`        | :white_check_mark: |     :white_check_mark:     | :white_check_mark: |
| `dotnetcore3.1` |        :x:         |            :x:             |        :x:         |
| `dotnet6`       | :white_check_mark: |     :white_check_mark:     | :white_check_mark: |
| `go1.x`         | :white_check_mark: |     :white_check_mark:     | :white_check_mark: |
| `ruby2.7`       | :white_check_mark: |            :x:             | :white_check_mark: |

:white_check_mark: Supported

:eight_pointed_black_star: Supported but requires code change

:x: Not supported

## Setup

In addition to common [Pre Setup](../README.md#pre-setup) and [Setup](../README.md#setup) instructions,
there is one additional setup step required for AWS SAM.

You need to set `MERLOC_SAM_FUNCTION_NAME` environment variable of the AWS Lambda function
to the logical resource id of your AWS Lambda function defined in the `template.yml` file.

Let's say that you have the following `template.yml`:
```yml
...

Resources:
  HelloWorldFunction:
    Type: AWS::Serverless::Function
    Properties:
      ...

...
```

In this example, logical resource id of your AWS Lambda function is `HelloWorldFunction`,
so you need to set `MERLOC_SAM_FUNCTION_NAME` environment variable to `HelloWorldFunction`.
This is needed by MerLoc to map remote AWS Lambda function name to the logical resource id of the function on local
as it is required my AWS SAM local invoke.

## Run

**MerLoc CLI** (`merloc` command) must be run in your **AWS SAM** project root directory where `template.yml` file is located.
Even though AWS SAM is detected when there is `template.yml` in the project root directory, 
it is suggested to specify AWS SAM local invoker by passing `-i sam-local` explicitly.

For example:
  ```
  merloc -b wss://a1b2c3d4e5.execute-api.us-west-2.amazonaws.com/dev -i sam-local
  ```  

## Debug

You need to enable debugging by passing `-d` (or `--debug`) option additionally as debugging is disabled by default.

For example:
```
merloc -b wss://a1b2c3d4e5.execute-api.us-west-2.amazonaws.com/dev -i sam-local -d
```  

Then at the first invocation of each function, you will see debug info logs and asked to be attached to the debug port.
Once you attach the debug port, the invocation will continue and will be stopped at breakpoint. 
Then you can debug function locally from your IDE.

> Tip:
> The suggested way is adding breakpoints first and attaching debugger after then.

### Node.js

```
[MERLOC] <invocation-time> | INFO  - You can attach debugger at localhost:<debug-port-no>
[MERLOC] <invocation-time> | INFO  - Docker environment started for function <function-name>
...
<function-name>  START RequestId: <request-id> Version: <version>
<function-name>  Debugger listening on ws://0.0.0.0:<debug-port-no>/<debug-session-id>
<function-name>  For help, see: https://nodejs.org/en/docs/inspector
```

Then you can attach your Node.js debugger to the debug port (shown as `<debug-port-no>` in the above logs) on `localhost`.
Once your debugger attached, you will see a log message like this in the MerLoc CLI console:
```
<function-name>  Debugger attached.
```

### Python

Add _ptvsd_ python library to your requirements and paste the following snippet before your lambda function.

```python
if "AWS_SAM_LOCAL" in os.environ and os.environ["AWS_SAM_LOCAL"]:
    import ptvsd
    ptvsd.enable_attach(address=('0.0.0.0', os.environ["MERLOC_DOCKER_DEBUG_PORT"]), redirect_output=True)
    ptvsd.wait_for_attach()
```

After run merloc command specified above, you can see following message at terminal.

```
[MERLOC] 17:47:11 GMT+3 | INFO  - AWS Lambda API for function <function-name> is up
[MERLOC] 17:47:13 GMT+3 | INFO  - Docker environment started for function <function-name>
[MERLOC] 17:47:13 GMT+3 | INFO  - You can attach debugger at localhost:<docker-port-no>
```

Then you can attach your Python debugger to the debug port (shown as `<debug-port-no>` in the above logs) on `localhost` by changing
_GET_MERLOC_DOCKER_PORT_FROM_TERMINAL_ into .vscode/launch.json.
Once your debugger attached, you will see a log message like this in the MerLoc CLI console and hit breakpoint:
```
<function-name>  START RequestId: 8c6a9575-0014-16b1-93df-c0dd6a853fe3 Version: $LATEST
```

### Java

```
[MERLOC] <invocation-time> | INFO  - You can attach debugger at localhost:<debug-port-no>
[MERLOC] <invocation-time> | INFO  - Docker environment started for function <function-name>
...
<function-name>  START RequestId: <request-id> Version: <version>
<function-name>  Picked up _JAVA_OPTIONS: -agentlib:jdwp=transport=dt_socket,server=y,suspend=y,quiet=y,address=<debug-port-no> ...
```

Then you can attach your Java debugger to the debug port (shown as `<debug-port-no>` in the above logs) on `localhost`.

### .NET

```
[MERLOC] 17:47:11 GMT+3 | INFO  - AWS Lambda API for function <function-name> is up
[MERLOC] 17:47:13 GMT+3 | INFO  - Docker environment started for function <function-name>
[MERLOC] 17:47:13 GMT+3 | INFO  - You can attach debugger at localhost:<docker-port-no>
```

Then you can trigger your lambda function from "TEST" at aws console and you will see a log message like this in the MerLoc CLI console:
```
<function-name>  START RequestId: c4dc9c03-8a13-4b1b-ad50-961305a5f073 Version: $LATEST
<function-name> [Info] Waiting for the debugger to attach...
```

Add the following snippet into your vscode/launch.json and change according to your project.

```
{
            "name": "Docker .NET Core Attach (Preview)",
            "type": "docker",
            "request": "attach",
            "platform": "netCore",
            "sourceFileMap": {
                "/src": "${workspaceFolder}"
            }
        }
```

Start debugger on VSCode and then select samcli/lambda container and click yes for "Attaching to container requires .NET Core debugger in the container. Do you want to copy the debugger to the container?" to allow 
.NET debugger copying into Merloc samcli/lambda container. After all this process, you can see hitting breakpoint.

### Go

TBD

## Hot-Reload

You need to enable hot-reloading by passing `-r` (or `--reload`) option additionally as hot-reloading is disabled by default.

For example:
```
merloc -b wss://a1b2c3d4e5.execute-api.us-west-2.amazonaws.com/dev -i sam-local -r
```  

If hot-reloading is enabled, current directory is watched for changes. 
If you want to configure paths (directories and files) to be watched, 
you can use `-w <paths...>` (or `--watch <paths...>`) option as described [here](../README.md#configuration).

Then, when there are changes detected under watched paths, 
reload command, which is `sam build` by default, is executed automatically.
Additionally, reload command can be configured by `--sam-reload <cmd>` option.

When hot-reloading is triggered and applied, you will see log messages in the MerLoc CLI console like this:
```
[MERLOC] <time> | INFO  - Reloading ...
[MERLOC] <time> | INFO  - Running "sam build" ...
...
[MERLOC] <time> | INFO  - Reloaded
```

### Node.js

#### Javascript

For example, let's say that you use pure Javascript and you have `.js` files in your project.
If you want to enable hot-reloading and watch changes for `.js` files, 
you can use the following sample options:
```
merloc -b wss://a1b2c3d4e5.execute-api.us-west-2.amazonaws.com/dev -i sam-local -r -w '**/*.js'
``` 

#### Typescript

If you use Typescript and you have `.ts` files in your project,
you can use the following sample options to enable hot-reloading and watch changes for `.ts` files:
```
merloc -b wss://a1b2c3d4e5.execute-api.us-west-2.amazonaws.com/dev -i sam-local -r -w '**/*.ts'
``` 

If you have both Typescript (`.ts`) and pure Javascript (`.js`) files,
you can use the following sample options:
```
merloc -b wss://a1b2c3d4e5.execute-api.us-west-2.amazonaws.com/dev -i sam-local -r -w '**/*.js' '**/*.ts'
``` 

### Python

If you use Python and you have `.py` files in your project,
you can use the following sample options to enable hot-reloading and watch changes for `.py` files:
```
merloc -b wss://a1b2c3d4e5.execute-api.us-west-2.amazonaws.com/dev -i sam-local -r -w '**/*.py'
``` 

### Java

For example, let's say that you use pure Java and you have `.java` files under `src` directory in your project.
If you want to enable hot-reloading and watch changes for `.java` files under `src` directory,
you can use the following sample options:
```
merloc -b wss://a1b2c3d4e5.execute-api.us-west-2.amazonaws.com/dev -i sam-local -r -w 'src/**/*.java'
``` 

#### Kotlin

If you use Kotlin and you have `.kt` files under `src` directory in your project,
you can use the following sample options to enable hot-reloading and watch changes for `.kt` files:
```
merloc -b wss://a1b2c3d4e5.execute-api.us-west-2.amazonaws.com/dev -i sam-local -r -w 'src/**/*.kt'
``` 

If you have both Kotlin (`.kt`) and pure Java (`.java`) files,
you can use the following sample options:
```
merloc -b wss://a1b2c3d4e5.execute-api.us-west-2.amazonaws.com/dev -i sam-local -r -w 'src/**/*.java' 'src/**/*.kt'
``` 

#### Scala

If you use Scala and you have `.scala` files under `src` directory in your project,
you can use the following sample options to enable hot-reloading and watch changes for `.scala` files:
```
merloc -b wss://a1b2c3d4e5.execute-api.us-west-2.amazonaws.com/dev -i sam-local -r -w 'src/**/*.scala'
``` 

If you have both Scala (`.scala`) and pure Java (`.java`) files,
you can use the following sample options:
```
merloc -b wss://a1b2c3d4e5.execute-api.us-west-2.amazonaws.com/dev -i sam-local -r -w 'src/**/*.java' 'src/**/*.scala'
``` 

### .NET

If you use .NET and you have `.cs` files in your project,
you can use the following sample options to enable hot-reloading and watch changes for `.cs` files:
```
merloc -b wss://a1b2c3d4e5.execute-api.us-west-2.amazonaws.com/dev -i sam-local -r -w '**/*.cs'
``` 

### Go

If you use Go and you have `.go` files in your project,
you can use the following sample options to enable hot-reloading and watch changes for `.go` files:
```
merloc -b wss://a1b2c3d4e5.execute-api.us-west-2.amazonaws.com/dev -i sam-local -r -w '**/*.go'
``` 

## Configuration

In addition to common [configurations](../README.md#configuration), there are also AWS SAM specific configurations:

- `--sam-options <options>`: Specifies extra options to be passed to AWS SAM local command (`sam local start-lambda`)
- `--sam-init <cmd>`: Specifies command to be run initially once when CLI is started and activated. 
  This configuration is **OPTIONAL**. The default value is `sam build`.
  For example:
  ```
  merloc -b wss://a1b2c3d4e5.execute-api.us-west-2.amazonaws.com/dev -i sam-local --sam-init './init.sh'
  ```  
- `--sam-reload <cmd>`: Specifies command to be run on hot-reload when changes are detected or triggered manually by `Ctrl+R`. 
  This configuration is **OPTIONAL**. The default value is `sam build`.
  For example:
  ```
  merloc -b wss://a1b2c3d4e5.execute-api.us-west-2.amazonaws.com/dev -i sam-local --sam-reload './reload.sh'
  ```  
  
## Troubleshooting

- If you encounter the following error when running function locally,
  ```
  [MERLOC] <invocation-time> | INFO  - Docker environment started for function <function-name>
  ...
  <function-name>  Exception on /2015-03-31/functions/<function-name>/invocations [POST]
  <function-name>  Traceback (most recent call last):
  ...
  <function-name> samcli.commands.local.cli_common.user_exceptions.CredentialsRequired: Credentials provided are missing lambda:Getlayerversion policy that is needed to download the layer or you do not have permission to download the layer
  <function-name> <invocation-time> 127.0.0.1 - - [<invocation-time>] "POST /2015-03-31/functions/<function-name>/invocations HTTP/1.1" 500 -
  [MERLOC] <invocation-time> | ERROR - <SAMLocalInvoker> Error occurred while handling invocation request for function <function-name>: AxiosError: Request failed with status code 500
  ```

  This means that either your don't have `default` AWS profile in your local AWS credentials (`~/.aws/credentials` by default), 
  or your `default` profile doesn't have AWS IAM permissions to download the layer. 
  In this case, you have the following options to solve this problem:
  - Define a `default` AWS profile in your local AWS credentials (`~/.aws/credentials` by default) which has enough AWS IAM permissions to download the   layer
  - If the `default` AWS profile is already exist, give enough AWS IAM permissions to your `default` AWS profile to download the layer
  - Or use a different AWS profile which has enough AWS IAM permissions to download the layer 
    by specifying the AWS profile name through `AWS_PROFILE` environment variable while running MerLoc CLI.
    For example:
    ```
    AWS_PROFILE=<my-aws-profile> merloc wss://a1b2c3d4e5.execute-api.us-west-2.amazonaws.com/dev -i sam-local 
    ```

- If you encounter the following error when running function locally,
  ```
  [MERLOC] <invocation-time> | WARN  - Unable to resolve AWS SAM function resource name for function name <function-name>". Please be sure that you set AWS SAM function resource name in your "template.yml" to "MERLOC_SAM_FUNCTION_NAME" environment variable
  ```

  This means that 
  - either you didn't set `MERLOC_SAM_FUNCTION_NAME` environment variable at all
  - or you only set `MERLOC_SAM_FUNCTION_NAME` in the `template.yml` locally and have not deployed yet, so it is not available in the AWS Lambda.

  To fix this, you need to set `MERLOC_SAM_FUNCTION_NAME` environment variable of the AWS Lambda function
  to the logical resource id of your AWS Lambda function defined in the `template.yml` file as explained in the [Setup](#setup) section above.

- If you encounter the following error when running function locally,
  ```
  <function-name>  Error: Running AWS SAM projects locally requires Docker. Have you got it installed and running?
  ```

  This means that there is no Docker up and running on your local. 
  To use MerLoc CLI with AWS SAM, you need to have installed Docker up and running on your local. 

- If you encounter the following error when running function locally,
  ```
  <function-name>  /opt/extensions/merloc-gatekeeper: line 10:    21 Killed                  _NODE_OPTIONS="$NODE_OPTIONS" NODE_OPTIONS="" /opt/extensions/merloc-gatekeeper-ext/bin/node /opt/extensions/merloc-gatekeeper-ext/dist/index.js
  <function-name>  <invocation-time> [ERROR] (rapid) Init failed error=exit status 137 InvokeID=
  ```
  
  This means that MerLoc Gatekeeper extension killed by Linux OOM Killer inside Docker because of insufficient memory. 
  You need to increase memory limit of the function in your `template.yml`.
  This error typically happens when memory limit is around `128 MB`. 
  So in this case, you should consider give `256 MB` or more memory limit to the function `template.yml`.
