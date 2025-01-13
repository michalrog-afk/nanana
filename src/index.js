require( 'dotenv' ).config();

const express = require( 'express' );
const { v4: uuidv4 } = require( 'uuid' );
const { stringToHex, chunkToUtf8String, getRandomIDPro } = require( './utils.js' );
const { generateCursorChecksum, generateHashed64Hex } = require( './generate.js' );
const app = express();

// 在文件开头附近添加
const startTime = new Date();
const version = '1.0.0';
let totalRequests = 0;
let activeRequests = 0;

// 在文件开头添加日志存储
const requestLogs = [];

// 中间件配置
app.use( express.json() );
app.use( express.urlencoded( { extended: true } ) );

// 添加支持的模型列表
const SUPPORTED_MODELS = [
  {
    id: "claude-3-5-sonnet-20241022",
    created: 1706571819,
    object: "model",
    owned_by: "anthropic"
  },
  {
    id: "claude-3-opus",
    created: 1706571819,
    object: "model",
    owned_by: "anthropic"
  },
  {
    id: "claude-3-5-haiku",
    created: 1706571819,
    object: "model",
    owned_by: "anthropic"
  },
  {
    id: "claude-3-5-sonnet",
    created: 1706571819,
    object: "model",
    owned_by: "anthropic"
  },
  {
    id: "cursor-small",
    created: 1706571819,
    object: "model",
    owned_by: "cursor"
  },
  {
    id: "gemini-exp-1206",
    created: 1706571819,
    object: "model",
    owned_by: "google"
  },
  {
    id: "gemini-2.0-flash-exp",
    created: 1706571819,
    object: "model",
    owned_by: "google"
  },
  {
    id: "gemini-2.0-flash-thinking-exp",
    created: 1706571819,
    object: "model",
    owned_by: "google"
  },
  {
    id: "gpt-3.5-turbo",
    created: 1706571819,
    object: "model",
    owned_by: "openai"
  },
  {
    id: "gpt-4",
    created: 1706571819,
    object: "model",
    owned_by: "openai"
  },
  {
    id: "gpt-4-turbo-2024-04-09",
    created: 1706571819,
    object: "model",
    owned_by: "openai"
  },
  {
    id: "gpt-4o",
    created: 1706571819,
    object: "model",
    owned_by: "openai"
  },
  {
    id: "gpt-4o-mini",
    created: 1706571819,
    object: "model",
    owned_by: "openai"
  },
  {
    id: "o1-mini",
    created: 1706571819,
    object: "model",
    owned_by: "openai"
  },
  {
    id: "o1-preview",
    created: 1706571819,
    object: "model",
    owned_by: "openai"
  }
];

// 添加认证中间件
const authenticateRequest = ( req, res, next ) => {
  let authToken = req.headers.authorization?.replace( 'Bearer ', '' );

  // 处理逗号分隔的密钥
  if ( authToken ) {
    const keys = authToken.split( ',' ).map( key => key.trim() );
    if ( keys.length > 0 ) {
      authToken = keys[0]; // 使用第一个密钥
    }
    // 处理 %3A%3A 格式
    if ( authToken.includes( '%3A%3A' ) ) {
      authToken = authToken.split( '%3A%3A' )[1];
    }
  }

  if ( !authToken ) {
    // 只有根路由显示 200 OK 和运行时间
    if ( req.path === '/' ) {
      const uptime = Math.floor( ( new Date() - startTime ) / 1000 );
      const uptimeStr = `${Math.floor( uptime / 3600 )}小时${Math.floor( ( uptime % 3600 ) / 60 )}分${uptime % 60}秒`;

      return res.status( 200 ).send( `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>200 OK</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                    background: #fff;
                }
                .message {
                    text-align: center;
                    color: #666;
                }
                .uptime {
                    font-size: 14px;
                    color: #999;
                    margin-top: 10px;
                }
            </style>
        </head>
        <body>
            <div class="message">
                <h1>200 OK</h1>
                <div class="uptime">运行时间：${uptimeStr}</div>
            </div>
        </body>
        </html>
      `);
    } else {
      // 其他路由返回 404
      return res.status( 404 ).json( {
        error: 'Not Found',
        message: 'The requested resource does not exist.'
      } );
    }
  }
  next();
};

// 修改根路由，添加认证
app.get( '/', authenticateRequest, ( req, res ) => {
  const uptime = Math.floor( ( new Date() - startTime ) / 1000 );
  const uptimeStr = `${Math.floor( uptime / 3600 )}小时${Math.floor( ( uptime % 3600 ) / 60 )}分${uptime % 60}秒`;

  const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>API Documentation</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 1000px;
            margin: 20px auto;
            padding: 20px;
            background: #fff;
            color: #333;
        }
        .endpoint {
            background: #f8f9fa;
            padding: 20px;
            margin: 15px 0;
            border-radius: 6px;
            border: 1px solid #e9ecef;
        }
        .method {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 13px;
            font-weight: bold;
            margin-right: 10px;
        }
        .get { background: #61affe; color: white; }
        .post { background: #49cc90; color: white; }
        .url {
            font-family: monospace;
            font-size: 14px;
            color: #333;
            padding: 2px 6px;
            background: #e9ecef;
            border-radius: 3px;
        }
        .description {
            margin: 10px 0;
            color: #666;
        }
        .params {
            margin: 15px 0;
            font-size: 14px;
        }
        .param-name {
            font-family: monospace;
            color: #e83e8c;
        }
        .param-type {
            color: #0066cc;
            font-family: monospace;
        }
        .required {
            color: #dc3545;
            font-size: 12px;
            margin-left: 5px;
        }
        .auth-required {
            display: inline-block;
            padding: 2px 6px;
            background: #ffd700;
            color: #333;
            border-radius: 3px;
            font-size: 12px;
            margin-left: 10px;
        }
        .example {
            background: #2d2d2d;
            color: #fff;
            padding: 15px;
            border-radius: 4px;
            margin: 10px 0;
            font-family: monospace;
            font-size: 13px;
        }
        .status {
            margin-bottom: 30px;
            padding: 15px;
            background: #e9ecef;
            border-radius: 6px;
            font-size: 14px;
        }
        h1 {
            color: #333;
            margin-bottom: 30px;
        }
        .header {
            margin-bottom: 10px;
            display: flex;
            align-items: center;
        }
    </style>
</head>
<body>
    <h1>API 接口文档</h1>
    
    <div class="status">
        <p>服务运行时间: ${uptimeStr}</p>
        <p>总请求数: ${totalRequests}</p>
        <p>当前活跃请求: ${activeRequests}</p>
    </div>

    <div class="endpoint">
        <div class="header">
            <span class="method get">GET</span>
            <span class="url">/v1/models</span>
        </div>
        <div class="description">获取所有支持的AI模型列表</div>
        <div class="params">
            <p><strong>认证：</strong>不需要</p>
            <p><strong>返回：</strong>JSON格式的模型列表</p>
        </div>
        <div class="example">
curl http://localhost:3000/v1/models
        </div>
    </div>

    <div class="endpoint">
        <div class="header">
            <span class="method post">POST</span>
            <span class="url">/v1/chat/completions</span>
            <span class="auth-required">需要认证</span>
        </div>
        <div class="description">AI对话接口，支持流式输出和普通输出</div>
        <div class="params">
            <p><strong>请求头：</strong></p>
            <ul>
                <li><span class="param-name">Authorization</span>: Bearer &lt;your_token&gt; <span class="required">必需</span></li>
            </ul>
            <p><strong>请求体参数：</strong></p>
            <ul>
                <li><span class="param-name">model</span> <span class="param-type">string</span> <span class="required">必需</span> - AI模型ID</li>
                <li><span class="param-name">messages</span> <span class="param-type">array</span> <span class="required">必需</span> - 对话消息数组</li>
                <li><span class="param-name">stream</span> <span class="param-type">boolean</span> - 是否使用流式输出</li>
            </ul>
        </div>
        <div class="example">
curl -X POST http://localhost:3000/v1/chat/completions \\
  -H "Authorization: Bearer your_token" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Hello"}],
    "stream": false
  }'
        </div>
    </div>

    <div class="endpoint">
        <div class="header">
            <span class="method get">GET</span>
            <span class="url">/checksum</span>
        </div>
        <div class="description">生成新的checksum</div>
        <div class="params">
            <p><strong>认证：</strong>不需要</p>
            <p><strong>返回：</strong>JSON格式的checksum</p>
        </div>
        <div class="example">
curl http://localhost:3000/checksum
        </div>
    </div>

    <div class="endpoint">
        <div class="header">
            <span class="method get">GET</span>
            <span class="url">/env-checksum</span>
        </div>
        <div class="description">获取环境变量中的checksum配置</div>
        <div class="params">
            <p><strong>认证：</strong>不需要</p>
            <p><strong>返回：</strong>JSON格式的环境变量checksum状态</p>
        </div>
        <div class="example">
curl http://localhost:3000/env-checksum
        </div>
    </div>

    <div class="endpoint">
        <div class="header">
            <span class="method get">GET</span>
            <span class="url">/logs</span>
        </div>
        <div class="description">获取请求日志记录</div>
        <div class="params">
            <p><strong>查询参数：</strong></p>
            <ul>
                <li><span class="param-name">limit</span> <span class="param-type">number</span> - 返回的日志条数（默认100）</li>
            </ul>
        </div>
        <div class="example">
curl http://localhost:3000/logs?limit=50
        </div>
    </div>
</body>
</html>
  `;

  res.send( html );
} );

// 添加请求计数中间件
app.use( ( req, res, next ) => {
  totalRequests++;
  activeRequests++;

  res.on( 'finish', () => {
    activeRequests--;
  } );

  next();
} );

// 添加新的路由处理模型列表请求，添加认证
app.get( '/v1/models', authenticateRequest, ( req, res ) => {
  res.json( {
    object: "list",
    data: SUPPORTED_MODELS
  } );
} );

// 添加认证
app.get( '/checksum', authenticateRequest, ( req, res ) => {
  const checksum = generateCursorChecksum( generateHashed64Hex(), generateHashed64Hex() );
  res.json( {
    checksum
  } );
} );

// 添加获取环境变量checksum的接口，添加认证
app.get( '/env-checksum', authenticateRequest, ( req, res ) => {
  const envChecksum = process.env['X_CURSOR_CHECKSUM'];
  res.json( {
    status: envChecksum ? 'configured' : 'not_configured',
    checksum: envChecksum || null
  } );
} );

app.post( '/v1/chat/completions', async ( req, res ) => {
  const requestTime = new Date();
  let usedChecksum;

  try {
    // o1开头的模型，不支持流式输出
    if ( req.body.model.startsWith( 'o1-' ) && req.body.stream ) {
      return res.status( 400 ).json( {
        error: 'Model not supported stream',
      } );
    }

    let currentKeyIndex = 0;
    const { model, messages, stream = false } = req.body;
    let authToken = req.headers.authorization?.replace( 'Bearer ', '' );
    // 处理逗号分隔的密钥
    const keys = authToken.split( ',' ).map( ( key ) => key.trim() );
    if ( keys.length > 0 ) {
      // 确保 currentKeyIndex 不会越界
      if ( currentKeyIndex >= keys.length ) {
        currentKeyIndex = 0;
      }
      // 使用当前索引获取密钥
      authToken = keys[currentKeyIndex];
    }
    if ( authToken && authToken.includes( '%3A%3A' ) ) {
      authToken = authToken.split( '%3A%3A' )[1];
    }
    if ( !messages || !Array.isArray( messages ) || messages.length === 0 || !authToken ) {
      return res.status( 400 ).json( {
        error: 'Invalid request. Messages should be a non-empty array and authorization is required',
      } );
    }

    const hexData = await stringToHex( messages, model );

    // 记录使用的 checksum
    usedChecksum = req.headers['x-cursor-checksum']
      ?? process.env['X_CURSOR_CHECKSUM'] // 环境变量使用大写
      ?? generateCursorChecksum( generateHashed64Hex(), generateHashed64Hex() );

    // 添加日志记录
    requestLogs.push( {
      timestamp: requestTime,
      model: req.body.model,
      checksum: usedChecksum.slice( 0, 5 ) + '...' + usedChecksum.slice( -5 ),
      authToken: authToken.slice( 0, 5 ) + '...' + authToken.slice( -5 ),
      stream: req.body.stream || false,
    } );

    // 只保留最近100条记录
    if ( requestLogs.length > 100 ) {
      requestLogs.shift();
    }

    const response = await fetch( 'https://api2.cursor.sh/aiserver.v1.AiService/StreamChat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/connect+proto',
        authorization: `Bearer ${authToken}`,
        'connect-accept-encoding': 'gzip,br',
        'connect-protocol-version': '1',
        'user-agent': 'connect-es/1.4.0',
        'x-amzn-trace-id': `Root=${uuidv4()}`,
        'x-cursor-checksum': usedChecksum,
        'x-cursor-client-version': '0.42.3',
        'x-cursor-timezone': 'Asia/Shanghai',
        'x-ghost-mode': 'false',
        'x-request-id': uuidv4(),
        Host: 'api2.cursor.sh',
      },
      body: hexData,
    } );

    if ( stream ) {
      res.setHeader( 'Content-Type', 'text/event-stream' );
      res.setHeader( 'Cache-Control', 'no-cache' );
      res.setHeader( 'Connection', 'keep-alive' );

      const responseId = `chatcmpl-${uuidv4()}`;

      // 使用封装的函数处理 chunk
      for await ( const chunk of response.body ) {
        const text = await chunkToUtf8String( chunk );

        if ( text.length > 0 ) {
          res.write(
            `data: ${JSON.stringify( {
              id: responseId,
              object: 'chat.completion.chunk',
              created: Math.floor( Date.now() / 1000 ),
              model,
              choices: [
                {
                  index: 0,
                  delta: {
                    content: text,
                  },
                },
              ],
            } )}\n\n`,
          );
        }
      }

      res.write( 'data: [DONE]\n\n' );
      return res.end();
    } else {
      let text = '';
      // 在非流模式下也使用封装的函数
      for await ( const chunk of response.body ) {
        text += await chunkToUtf8String( chunk );
      }
      // 对解析后的字符串进行进一步处理
      text = text.replace( /^.*<\|END_USER\|>/s, '' );
      text = text.replace( /^\n[a-zA-Z]?/, '' ).trim();
      // console.log(text)

      return res.json( {
        id: `chatcmpl-${uuidv4()}`,
        object: 'chat.completion',
        created: Math.floor( Date.now() / 1000 ),
        model,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: text,
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
        },
      } );
    }
  } catch ( error ) {
    console.error( 'Error:', error );
    if ( !res.headersSent ) {
      if ( req.body.stream ) {
        res.write( `data: ${JSON.stringify( { error: 'Internal server error' } )}\n\n` );
        return res.end();
      } else {
        return res.status( 500 ).json( { error: 'Internal server error' } );
      }
    }
  }
} );

// 添加日志获取接口，添加认证
app.get( '/logs', authenticateRequest, ( req, res ) => {
  const limit = parseInt( req.query.limit ) || 100;
  res.json( {
    total: requestLogs.length,
    logs: requestLogs.slice( -limit ),
    timestamp: new Date().toISOString(),
    status: 'success'
  } );
} );

// 在所有路由定义之后，404处理之前添加方法不允许的处理
const VALID_ROUTES = {
  '/': ['GET'],
  '/v1/models': ['GET'],
  '/checksum': ['GET'],
  '/env-checksum': ['GET'],
  '/v1/chat/completions': ['POST'],
  '/logs': ['GET']
};

// 添加405处理中间件
app.use( ( req, res, next ) => {
  const route = VALID_ROUTES[req.path];
  if ( route ) {
    // 如果路由存在但方法不正确
    if ( !route.includes( req.method ) ) {
      return res.status( 405 ).json( {
        error: 'Method Not Allowed',
        message: `The ${req.method} method is not allowed for this endpoint.`,
        allowed_methods: route
      } );
    }
  }
  next();
} );

// 添加404处理中间件
app.use( ( req, res ) => {
  res.status( 404 ).json( {
    error: 'Not Found',
    message: 'The requested resource does not exist.'
  } );
} );

// 启动服务器
const PORT = process.env.PORT || 3000;
app.listen( PORT, () => {
  console.log( `服务器运行在端口 ${PORT}` );
} );