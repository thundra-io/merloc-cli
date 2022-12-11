# MerLoc - Serverless Framework

## Supported Runtimes

| Runtime         |     Local Run      |    Breakpoint Debugging    |     Hot-Reload     |
|-----------------|:------------------:|:--------------------------:|:------------------:|
| `nodejs12.x`    | :white_check_mark: |     :white_check_mark:     | :white_check_mark: |
| `nodejs14.x`    | :white_check_mark: |     :white_check_mark:     | :white_check_mark: |
| `nodejs16.x`    | :white_check_mark: |     :white_check_mark:     | :white_check_mark: |
| `nodejs18.x`    | :white_check_mark: |     :white_check_mark:     | :white_check_mark: |
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
there is one additional setup step required for Serverless Framework.

You need to set `MERLOC_SLS_FUNCTION_NAME` environment variable of the AWS Lambda function
to the logical resource id of your AWS Lambda function defined in the `serverless.yml` file.

Let's say that you have the following `serverless.yml`:
```yml
...

functions:
  HelloWorldFunction:
    name: hello-world
    ...

...
```

In this example, logical resource id of your AWS Lambda function is `HelloWorldFunction`,
so you need to set `MERLOC_SLS_FUNCTION_NAME` environment variable to `HelloWorldFunction`.
This is needed by MerLoc to map remote AWS Lambda function name to the logical resource id of the function on local
as it is required by Serverless local invoke.

## Run

**MerLoc CLI** (`merloc` command) must be run in your **Serverless Framework** project root directory where `serverless.yml` file is located.
Even though Serverless Framework is detected when there is `serverless.yml` in the project root directory,
it is suggested to specify Serverless Framework local invoker by passing `-i serverless-local` explicitly.

For example:
  ```
  merloc -b wss://a1b2c3d4e5.execute-api.us-west-2.amazonaws.com/dev -i serverless-local
  ```

## Debug

You need to enable debugging by passing `-d` (or `--debug`) option additionally as debugging is disabled by default.

For example:
```
merloc -b wss://a1b2c3d4e5.execute-api.us-west-2.amazonaws.com/dev -i serverless-local -d
```  

Then at the first invocation of each function, you will see debug info logs and asked to be attached to the debug port.
Once you attach the debug port, the invocation will continue and will be stopped at breakpoint.
Then you can debug function locally from your IDE.

> Tip:
> The suggested way is adding breakpoints first and attaching debugger after then.

### Node.js

```
[MERLOC] <invocation-time> | INFO  - Docker environment started for function <function-name>
[MERLOC] <invocation-time> | INFO  - You can attach debugger at localhost:<debug-port-no>
<function-name>  Debugger listening on ws://0.0.0.0:<debug-port-no>/<debug-session-id>
<function-name>  For help, see: https://nodejs.org/en/docs/inspector

```

Then you can attach your Node.js debugger to the debug port (shown as `<debug-port-no>` in the above logs) on `localhost`.
Once your debugger attached, you will see a log message like this in the MerLoc CLI console:
```
<function-name>  Debugger attached.
```

Later than, invocation will continue and hit the breakpoint you put.

### Python

TBD

### Java

TBD

### .NET

TBD

### Go

TBD

## Hot-Reload

You need to enable hot-reloading by passing `-r` (or `--reload`) option additionally as hot-reloading is disabled by default.

For example:
```
merloc -b wss://a1b2c3d4e5.execute-api.us-west-2.amazonaws.com/dev -i serverless-local -r
```  

If hot-reloading is enabled, current directory is watched for changes.
If you want to configure paths (directories and files) to be watched,
you can use `-w <paths...>` (or `--watch <paths...>`) option as described [here](../README.md#configuration).

Then, when there are changes detected under watched paths,
current local function environment (Docker container) is stopped and fresh one is spun up at the next invocation for that function.
Additionally, custom reload command can be configured by `--sls-reload <cmd>` option.

When hot-reloading is triggered and applied, you will see log messages in the MerLoc CLI console like this:
```
[MERLOC] <time> | INFO  - Reloading ...
<function-name>  (stopped)
[MERLOC] <time> | INFO  - Reloaded
```

#### Javascript

For example, let's say that you use pure Javascript and you have `.js` files in your project.
If you want to enable hot-reloading and watch changes for `.js` files,
you can use the following sample options:
```
merloc -b wss://a1b2c3d4e5.execute-api.us-west-2.amazonaws.com/dev -i serverless-local -r -w '**/*.js'
``` 

#### Typescript

If you use Typescript and you have `.ts` files in your project,
you can use the following sample options to enable hot-reloading and watch changes for `.ts` files:
```
merloc -b wss://a1b2c3d4e5.execute-api.us-west-2.amazonaws.com/dev -i serverless-local -r -w '**/*.ts'
``` 

If you have both Typescript (`.ts`) and pure Javascript (`.js`) files,
you can use the following sample options:
```
merloc -b wss://a1b2c3d4e5.execute-api.us-west-2.amazonaws.com/dev -i serverless-local -r -w '**/*.js' '**/*.ts'
``` 

### Python

If you use Python and you have `.py` files in your project,
you can use the following sample options to enable hot-reloading and watch changes for `.py` files:
```
merloc -b wss://a1b2c3d4e5.execute-api.us-west-2.amazonaws.com/dev -i serverless-local -r -w '**/*.py'
``` 

### Java

For example, let's say that you use pure Java and you have `.java` files under `src` directory in your project.
If you want to enable hot-reloading and watch changes for `.java` files under `src` directory,
you can use the following sample options:
```
merloc -b wss://a1b2c3d4e5.execute-api.us-west-2.amazonaws.com/dev -i serverless-local -r -w 'src/**/*.java'
``` 

#### Kotlin

If you use Kotlin and you have `.kt` files under `src` directory in your project,
you can use the following sample options to enable hot-reloading and watch changes for `.kt` files:
```
merloc -b wss://a1b2c3d4e5.execute-api.us-west-2.amazonaws.com/dev -i serverless-local -r -w 'src/**/*.kt'
``` 

If you have both Kotlin (`.kt`) and pure Java (`.java`) files,
you can use the following sample options:
```
merloc -b wss://a1b2c3d4e5.execute-api.us-west-2.amazonaws.com/dev -i serverless-local -r -w 'src/**/*.java' 'src/**/*.kt'
``` 

#### Scala

If you use Scala and you have `.scala` files under `src` directory in your project,
you can use the following sample options to enable hot-reloading and watch changes for `.scala` files:
```
merloc -b wss://a1b2c3d4e5.execute-api.us-west-2.amazonaws.com/dev -i serverless-local -r -w 'src/**/*.scala'
``` 

If you have both Scala (`.scala`) and pure Java (`.java`) files,
you can use the following sample options:
```
merloc -b wss://a1b2c3d4e5.execute-api.us-west-2.amazonaws.com/dev -i serverless-local -r -w 'src/**/*.java' 'src/**/*.scala'
``` 

### .NET

If you use .NET and you have `.cs` files in your project,
you can use the following sample options to enable hot-reloading and watch changes for `.cs` files:
```
merloc -b wss://a1b2c3d4e5.execute-api.us-west-2.amazonaws.com/dev -i serverless-local -r -w '**/*.cs'
``` 

### Go

If you use Go and you have `.go` files in your project,
you can use the following sample options to enable hot-reloading and watch changes for `.go` files:
```
merloc -b wss://a1b2c3d4e5.execute-api.us-west-2.amazonaws.com/dev -i serverless-local -r -w '**/*.go'
``` 

## Configuration

In addition to common [configurations](../README.md#configuration), there are also Serverless framework specific configurations:

- `--sls-options <options>`: Specifies extra options to be passed to Serverless local command (`serverless invoke local`)
- `--sls-init <cmd>`: Specifies command to be run initially once when CLI is started and activated.
  This configuration is **OPTIONAL** and there is no default value.
  For example:
  ```
  merloc -b wss://a1b2c3d4e5.execute-api.us-west-2.amazonaws.com/dev -i serverless-local --sls-init './init.sh'
  ```  
- `--sls-reload <cmd>`: Specifies command to be run on hot-reload when changes are detected or triggered manually by `Ctrl+R`.
  This configuration is **OPTIONAL** and there is no default value.
  For example:
  ```
  merloc -b wss://a1b2c3d4e5.execute-api.us-west-2.amazonaws.com/dev -i serverless-local --sls-reload './reload.sh'
  ```  

## Troubleshooting

- If you encounter the following error when running function locally,
  ```
  Error:
  TypeError [ERR_INVALID_ARG_TYPE]: The "path" argument must be of type string. Received undefined
  ...
  ```
  
  You need to enable individual packaging with the following configuration in your `serverless.yml`:
  ```yml
  package:
    individually: true
  ```
  
- If you encounter the following error when running function locally,
  ```
  Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?
  ...
  Error:
  Please start the Docker daemon to use the invoke local Docker integration.
  ```

  This means that there is no Docker up and running on your local.
  To use MerLoc CLI with Serverless Framework, you need to have installed Docker up and running on your local. 
