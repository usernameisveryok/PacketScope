#!/bin/bash

# 以 root 权限执行（使用 sudo 调用此脚本时生效）
ulimit -n 32768

# 切换到项目目录
cd /home/ubuntu/packetscope-web-app/modules/Tracer/ || exit 1

# 激活虚拟环境
source .venv/bin/activate

# 清理数据库文件
rm -rf *.db
rm -rf *.db-*

# 启动 Flask 服务
python flaskServerMain.py
