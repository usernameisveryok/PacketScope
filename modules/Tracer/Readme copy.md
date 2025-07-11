# Module 1 说明

本模块用于进行模块1的前端操作。

## 依赖

安装BCC,见https://github.com/iovisor/bcc/blob/master/INSTALL.md


安装Python依赖,见requirement.txt

## 运行

ulimit -n 16384

python3 flaskServerMain.py

需要超级用户权限。

本模块运行一个服务器，捕捉通过负载机的流量，服务器提供若干个API，可用于提供经处理的数据。

## 接口列表

### /ClearData

参数：GET方法，无参数
返回值：可无视

效果：清理历史数据

### /QuerySockList

参数：GET方法，无参数

返回值：形若
{"tcpipv4":[],"tcpipv6":[],"udpipv4":[],"udpipv6":[],"icmpipv4":[],"icmpipv6":[],"rawipv4":[],"rawipv6":[],"dev":[]}
的Dict

Socket数组内为为List,List成员为形若[当前时间,序号,源IP,目的IP,状态]的List

"dev"内为List,List成员为形若[当前时间,网口名]的List

应注意,提供的源IP和目的IP为HEX格式,即若8002A8C0:AA36式的,需通过简单转化变为可打印字符串.

### /GetFuncTable

参数：GET方法，无参数

返回值：形若
{"ID":{"name":函数名}}
的Dict

### /QueryPacket

参数:POST方法,参数如下

srcip:源IP

dstip:目的IP

srcport:源端口

dstport:目的端口

可得到交换的包

ipver:4/6

应注意:
对IPV6式的IP,其格式并不采用标准ipv6格式,所用格式如下:
fe80:0000:0000:0000:0250:56ff:fec0:2222

并未采用标准格式中的缩略规则

返回值:

IPV4型形若

[(时间,网口号,方向,包长度,包内容,源地址,目的地址,源端口,目的端口,下层协议类型,IPID,TTL,分片信息,可选字段),]

IPV6型形若

[(时间,网口号,方向,包长度,包内容,源地址,目的地址,头类型,源端口,目的端口),]

方向:0为入包,1为出包

### /GetRecentPacket

参数:POST方法,参数如下

srcip:源IP

dstip:目的IP

srcport:源端口

dstport:目的端口

ipver:4/6

count:最大获取包数量

应注意:
对IPV6式的IP,其格式并不采用标准ipv6格式,所用格式如下:
fe80:0000:0000:0000:0250:56ff:fec0:2222

并未采用标准格式中的缩略规则

返回值:形如
[[入包],[出包]]的数组

其中组成：IPV4型形若

[(时间,网口号,方向,包长度,包内容,源地址,目的地址,源端口,目的端口,下层协议类型,IPID,TTL,分片信息,可选字段),]

IPV6型形若

[(时间,网口号,方向,包长度,包内容,源地址,目的地址,头类型,源端口,目的端口),]

方向:0为入包,1为出包

### /QueryFuncSend 和 /QueryFuncRecv

参数:POST方法,参数如下

srcip:源IP

dstip:目的IP

srcport:源端口

dstport:目的端口

应注意:
对IPV6式的IP,其格式并不采用标准ipv6格式,所用格式如下:
fe80:0000:0000:0000:0250:56ff:fec0:2222
并未采用标准格式中的缩略规则。
应注意，不应交换二者，发包和收包有不同的判定规则，这一点在内核上非常明显。

返回值:

形如
[[入包],[出包]]的数组

入包或出包形如
[[(时间,是否为函数返回,ID号,调用的线程号),(时间,是否为函数返回,ID号,调用的线程号)],[(时间,是否为函数返回,ID号,调用的线程号),(时间,是否为函数返回,ID号,调用的线程号)],]
的List.

ID号通过GetFuncTable获取向函数名的映射表.不采用直接存储函数名,是为了减少存储的数据量.

curl -X POST http://localhost:19999/QueryFuncSend  -H "Content-Type: application/json" -d '{srcip": "127.0.0.54",dstip": "0.0.0.0",srcport": 53,dstport": 0}'

### /SetFilter 

参数:POST方法,参数如下

srcip:源IP

dstip:目的IP

srcport:源端口

dstport:目的端口

效果:设置一个过滤器,之后仅存储满足条件的包信息.

### /UnsetFilter

参数：GET方法，无参数
返回：可无视

效果：取消过滤器设为初始状态。

### /GetRecentMap

参数:POST方法,参数如下

srcip:源IP

dstip:目的IP

srcport:源端口

dstport:目的端口

count:查询的函数流图数量

返回：形如
[[(时间,是否为函数返回,ID号,调用的线程号),(时间,是否为函数返回,ID号,调用的线程号)],[(时间,是否为函数返回,ID号,调用的线程号),(时间,是否为函数返回,ID号,调用的线程号)],]
的List.

效果：捕捉指定方向的发送包和接收包,注意,不能随意颠倒,该接口获取的是源-目的的发送包,和目的-源的接收包.区分方法为:第一个ID号为20000x的,是发送包,为30000x的,是接收包.

### /IsAttachFinished

参数：GET方法，无参数
返回：json，为[True]或者[False],其中值为当前加载完成与否

## 实现说明

函数流图的匹配方法，按顺序匹配即可，最后一个函数流图对应最后一个包，必须按照倒序对应，而不能顺序对应。这是启动时间差别决定的。