- [ ] 需要将其打包成一个exe执行文件。这样避免依赖安装减小用户的使用难度。
- [ ] 返回数据中需要增加地理定位信息（经纬度），用于在地图上绘制地理路径。
- [ ] 服务需要支持跨域。
- [ ] 更新威胁情报（update_threat_intel），最好也作为一个接口提供。访问时会自动更新，这样方便将服务打包成一个exe文件。
- [ ] 由于响应采用流式方式，如果走缓存又非流式方式。而前端针对这种两种方式，需要不同处理。为了区分需要获取响应包头的“transfer-encoding==chunked”判断。由于属于“Transfer-Encoding”非简单响应头，要访问它，服务端必须设置 CORS 响应头：`Access-Control-Expose-Headers: Transfer-Encoding`

```python
from flask import Response, stream_with_context
from flask_cors import cross_origin

@app.route('/api/trace')
@cross_origin(expose_headers=["Transfer-Encoding"])  # 显式暴露
def trace():
    def generate():
        for hop in traceroute(target):
            yield json.dumps(hop) + '\n'

    return Response(stream_with_context(generate()), content_type='application/json')

```
