# Deploy

安装BCC

```bash
sudo apt-get install bpfcc-tools linux-headers-$(uname -r)
```



```bash
# Python 找不到 bcc 的问题（虚拟环境中)
ln -s /usr/lib/python3/dist-packages/bcc \
  /home/ubuntu/packetscope-web-app/modules/Analyzer/.venv/lib/python3.12/site-packages/bcc
```

基于vene安装依赖

```bash
sudo -i

cd /home/ubuntu/packetscope-web-app/modules/monitor

source .venv/bin/activate

pip install -r requirements.txt

python flaskServerMain.py
```



| 命令        | 作用                     | 环境加载情况           |
| --------- | ---------------------- | ---------------- |
| `sudo -i` | 以 root 用户登录启动交互式 shell | 会加载 root 的登录环境配置 |
| `sudo su` | 切换为 root 用户交互式 shell   | 通常不会加载 root 登录环境 |
| `sudo -s` | 以当前环境为基础启动 shell       | 不切换用户，只提升权限      |


### 问题

需要处理生成测数据库文件，随着运行时间的增加，文件大小回越来越大。需要适当时机处理一下。


### /QueryFuncSend 和 /QueryFuncRecv

```
curl -X POST http://localhost:19999/QueryPacket  -H "Content-Type: application/json" -d '{"srcip": "127.0.0.54","dstip": "0.0.0.0","srcport": 53,"dstport": 0,"ipver": 4}'


curl -X POST -F "srcip=172.21.0.4" -F "dstip=169.254.0.55" -F "srcport=54588" -F "dstport=5574" http://127.0.0.1:19999/QueryFuncSend


curl -X POST -F "srcip=172.21.0.4" -F "dstip=169.254.0.55" -F "srcport=54588" -F "dstport=5574" -F "count=100" http://127.0.0.1:19999/GetRecentMap
curl -X POST -F "dstip=172.21.0.4" -F "srcip=169.254.0.55" -F "dstport=54588" -F "srcport=5574" -F "count=10" http://127.0.0.1:19999/GetRecentMap
curl -X POST -F "dstip=172.21.0.4" -F "srcip=169.254.0.55" -F "dstport=54588" -F "srcport=5574" -F "ipver=4" -F "count=1" http://127.0.0.1:19999/GetRecentPacket
```