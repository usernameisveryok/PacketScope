#!/bin/bash

# 定义模块目录列表（可以根据实际情况修改）
modules=(
  "modules/Analyzer"
  "modules/guarder"
  "modules/locator"
  "modules/monitor"
)

# 遍历并启动每个模块
for module in "${modules[@]}"; do
  echo "Starting $module..."
  if [ -f "$module/start.sh" ]; then
    (cd "$module" && sudo ./start.sh)
  else
    echo "  ❌ $module/start.sh not found, skipping."
  fi
done

echo "✅ All modules processed."
