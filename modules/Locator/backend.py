from flask import Flask, Response, request, jsonify
import subprocess
import json
import os
import socket
from datetime import datetime
import geoip2.database
from flask_cors import CORS, cross_origin
import requests
import re
import statistics
from update_threat_intel import update_risky_ips
# 历史记录存储路径
HISTORY_DIR = "history"
# 创建存储目录（如果不存在）
os.makedirs(HISTORY_DIR, exist_ok=True)

# =========================
# 恶意 IP 黑名单加载模块
# =========================
RISKY_IPS_FILE = "risky_ips.json"
RISKY_IPS = {}

def load_risky_ips():
    global RISKY_IPS
    try:
        with open(RISKY_IPS_FILE, "r") as f:
            RISKY_IPS = json.load(f)
        print(f"[✓] Loaded {len(RISKY_IPS)} risky IPs.")
    except Exception as e:
        update_risky_ips()
        print(f"[!] Failed to load risky IPs: {e}")

# 启动时加载
load_risky_ips()

# =========================
# 工具函数
# =========================

app = Flask(__name__)
CORS(app)  # 默认允许所有跨域


geoip_reader = geoip2.database.Reader("GeoLite2-City.mmdb")
asn_reader = geoip2.database.Reader("GeoLite2-ASN.mmdb")


def get_timestamp():
    """获取当前时间戳"""
    return datetime.now().strftime("%Y%m%d-%H%M%S")

def sanitize_filename(name: str) -> str:
    """将 URL/IP 转为安全文件名"""
    return re.sub(r"[^0-9a-zA-Z_-]", "_", name)

def get_history_file_path(target: str, ip_address: str) -> str:
    """
    生成历史记录路径
    - target: 原始输入（URL 或 IP）
    - ip_address: 实际 traceroute 使用的 IP
    """
    ip_dir = os.path.join(HISTORY_DIR, ip_address)
    os.makedirs(ip_dir, exist_ok=True)

    safe_target = sanitize_filename(target)
    filename = f"{get_timestamp()}-{safe_target}.json"
    return os.path.join(ip_dir, filename)


def get_ip_from_url(target):
    """解析 URL 获取对应的 IP 地址"""
    try:
        return socket.gethostbyname(target)
    except socket.gaierror:
        return None
    
def list_history():
    """获取所有历史记录"""
    history_records = {}
    
    if not os.path.exists(HISTORY_DIR):
        return history_records

    for ip in os.listdir(HISTORY_DIR):
        ip_path = os.path.join(HISTORY_DIR, ip)
        if os.path.isdir(ip_path):
            history_records[ip] = sorted(os.listdir(ip_path), reverse=True)  # 按时间排序

    return history_records

def get_ip_info(ip):
    """ 获取 IP 地址的地理位置、ASN 和 ISP 信息 """
    
    # 优先使用 ip-api.com 接口
    try:
        api_url = f"http://ip-api.com/json/{ip}"
        response = requests.get(api_url, timeout=5)
        if response.status_code == 200:
            data = response.json()
            
            if data.get('status') == 'success':
                # 解析 ASN 信息
                as_info = data.get('as', '')
                asn_number = None
                if as_info.startswith('AS'):
                    asn_number = as_info.split(' ')[0][2:]  # 提取 AS 后面的数字
                
                location_data = {
                    "lat": data.get('lat'),
                    "lon": data.get('lon'),
                    "radius_km": None,  # ip-api.com 不提供精度半径
                    "timezone": data.get('timezone')
                }
                
                return {
                    "location": f"{data.get('city', 'Unknown')}, {data.get('country', 'Unknown')}",
                    "geo": location_data,
                    "asn": asn_number,
                    "isp": data.get('isp', 'Unknown')
                }
    except Exception as e:
        print(f"API 请求失败: {e}")
    
    # 如果 API 请求失败，使用默认的 GeoIP 数据库方法
    try:
        geo_info = geoip_reader.city(ip)
        asn_info = asn_reader.asn(ip)
        geo_location = geo_info.location
        
        location_data = {
            "lat": geo_location.latitude,
            "lon": geo_location.longitude,
            "radius_km": geo_location.accuracy_radius,
            "timezone": geo_location.time_zone
        }
        
        # print(f"使用本地数据库: {geo_info}")
        
        return {
            "location": f"{geo_info.city.name}, {geo_info.country.name}",
            "geo": location_data,
            "asn": asn_info.autonomous_system_number,
            "isp": asn_info.autonomous_system_organization
        }
    except Exception as e:
        # print(f"本地数据库查询失败: {e}")
        return {
            "location": "Unknown", 
            "asn": "Unknown", 
            "isp": "Unknown", 
            "geo": "Unknown"
        }

def enrich_geo(geo):
    """调用外部API获取经纬度"""
    if geo["city"]:
        # 假设调用 ip-api.com 或你自己的 Geo API
        try:
            url = f"http://ip-api.com/json/{geo['city']}?lang=zh-CN"
            resp = requests.get(url, timeout=3).json()
            geo["lat"] = resp.get("lat")
            geo["lon"] = resp.get("lon")
        except:
            pass
    return geo

def finalize_hop(hop):
    numeric_rtts = [r for r in hop["rtts"] if isinstance(r, float)]
    latency = statistics.mean(numeric_rtts) if numeric_rtts else None
    packet_loss = (
        f"{round(hop['rtts'].count('*') / len(hop['rtts']) * 100, 1)}%"
        if hop["rtts"] else "100%"
    )
    ip_info = get_ip_info(hop["ip"]) if hop["ip"] else {}
    if ip_info["isp"] == "DoD Network Information Center": 
        ip_info["isp"] = "unknown"
        ip_info["asn"] = "unknown"
        ip_info["location"] = "unknown"
        ip_info["geo"] = "unknown"
    return {
        "hop": hop["hop"],
        "ip": hop["ip"],
        "latency": round(latency, 2) if latency else None,
        "jitter": round(statistics.pstdev(numeric_rtts), 2) if len(numeric_rtts) > 1 else None,
        "packet_loss": packet_loss,
        "bandwidth_mbps": round(100.0 / (latency + 1), 2) if latency else None,
        "location": ip_info["location"],
        "asn": ip_info["asn"],
        "isp": ip_info["isp"],
        "geo": ip_info["geo"]
    }

def run_traceroute(target: str, ip_address: str):
    """ 逐行执行 traceroute 并流式返回 JSON 数据 """

    hops = []
    file_path = get_history_file_path(target, ip_address)
    # 运行 traceroute，逐行读取输出
    # traceroute_cmd = ["traceroute", "-I", target]  # ICMP 模式
    # result = subprocess.Popen(traceroute_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    nexttrace_cmd = ["nexttrace", ip_address]  # 不解析域名
    result = subprocess.Popen(nexttrace_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
    current_hop = None
    for line in result.stdout:
        line = ansi_escape.sub('', line).strip()
        if not line or line.startswith(("traceroute", "NextTrace", "[NextTrace", "IP")):
            continue
        # hop 开始行
        print(f"Processing line: {line}")
        if (re.match(r'^\d+', line) and "ms" not in line ) or "DOD" in line:
            parts = line.split()
            if len(parts) == 3:
                continue
            hop_num = int(parts[0])
            # print(f"Processing hop {hop_num}: {parts}")

            # 如果遇到新 hop，先保存上一个 hop
            if current_hop and hop_num != current_hop_num:
                hops.append(finalize_hop(current_hop))
                print(f"Saved hop: {hops[-1]}")
                yield json.dumps(hops[-1], ensure_ascii=False) + "\n"
                current_hop = None

            # 如果还没有 current_hop，初始化
            if not current_hop:
                ip = parts[1] if len(parts) >= 2 else None
                asn = parts[2] if len(parts) >= 3 and parts[2].startswith("AS") else None
                current_hop = {
                    "hop": hop_num,
                    "ip": ip,  # 只记录第一个 IP
                    "asn": asn,
                    # "location": f"{city}, {country}",
                    # "isp": isp,
                    # "geo": {"country": country, "city": city},
                    "rtts": []
                }
                current_hop_num = hop_num

        elif "ms" in line:
            matches = re.findall(r"(\d+\.\d+)\s*ms|\*", line)
            print(f"Processing RTT line: {matches}")
            for m in matches:
                if m == "*":
                    current_hop["rtts"].append("*")
                else:
                    try:
                        current_hop["rtts"].append(float(m))
                    except:
                        pass

    # 循环结束后，保存最后一个 hop
    if current_hop:
        hops.append(finalize_hop(current_hop))
        yield json.dumps(hops[-1], ensure_ascii=False) + "\n"


    # 保存完整结果到本地 JSON 文件
    with open(file_path, "w") as f:
        json.dump(hops, f, indent=4)
    # return hops



@app.route("/api/trace", methods=["GET"])
@cross_origin(expose_headers=["Transfer-Encoding"])  # 显式暴露
def trace_route():
    target = request.args.get("target")
    use_cache = request.args.get("cache", "true").lower() == "true"  # 默认使用缓存

    if not target:
        return jsonify({"error": "Missing 'target' parameter"}), 400

    # 解析 URL，如果输入是 URL，则转换为 IP
    ip_address = get_ip_from_url(target) if not target.replace(".", "").isdigit() else target
    if not ip_address:
        return jsonify({"error": f"Invalid target: {target}"}), 400


    # 检查是否有历史数据
    ip_dir = os.path.join(HISTORY_DIR, target)
    print(f"Checking history in {ip_dir}, use_cache={use_cache}")
    if use_cache and os.path.exists(ip_dir):
        print(f"Found history directory: {ip_dir}")
        files = sorted(os.listdir(ip_dir), reverse=True)  # 按时间倒序
        if files:
            latest_file = os.path.join(ip_dir, files[0])
            with open(latest_file, "r") as f:
                return Response(f.read(), mimetype="application/json")

    # 如果没有历史数据或用户强制刷新，执行新的 traceroute
    return Response(run_traceroute(target, ip_address), mimetype="application/json")


# 
@app.route("/api/history", methods=["GET"])
def get_history():
    """返回特定目标的历史记录（支持指定 target 查询）"""
    target = request.args.get("target")  # 获取目标 IP 或 URL

    if target:
        # 如果是 URL，则解析为 IP
        ip_address = get_ip_from_url(target) if not target.replace(".", "").isdigit() else target
        if not ip_address:
            return jsonify({"error": f"Invalid target: {target}"}), 400

        # 查询指定目标的历史记录
        ip_dir = os.path.join(HISTORY_DIR, ip_address)
        if not os.path.exists(ip_dir):
            return jsonify({"error": f"No history found for {target} ({ip_address})"}), 404

        history = []
        for file_name in sorted(os.listdir(ip_dir), reverse=True):  # 按时间倒序
            file_path = os.path.join(ip_dir, file_name)
            try:
                with open(file_path, "r") as f:
                    data = json.load(f)
                    timestamp = file_name.split("-")[0]  # 提取时间戳
                    history.append({"timestamp": timestamp, "result": data})
            except Exception as e:
                print(f"Error reading {file_path}: {e}")

        return jsonify({target: history})

    # 如果没有指定 target，则返回所有历史记录
    history_records = {}

    if not os.path.exists(HISTORY_DIR):
        return jsonify(history_records)

    for ip in os.listdir(HISTORY_DIR):
        ip_path = os.path.join(HISTORY_DIR, ip)
        if os.path.isdir(ip_path):
            history_records[ip] = []
            for file_name in sorted(os.listdir(ip_path), reverse=True):  # 按时间倒序
                file_path = os.path.join(ip_path, file_name)
                try:
                    with open(file_path, "r") as f:
                        data = json.load(f)
                        timestamp = file_name.split("-")[0]  # 提取时间戳
                        history_records[ip].append({"timestamp": timestamp, "result": data})
                except Exception as e:
                    print(f"Error reading {file_path}: {e}")

    return jsonify(history_records)


# =========================
# 风险分析模块
# =========================

def analyze_anomalies(current_hops, history_hops):
    anomalies = []
    prev_ips = {h["ip"] for hist in history_hops for h in hist}
    for idx, hop in enumerate(current_hops):
        ip = hop.get("ip")
        latency = hop.get("latency", 0)
        if ip not in prev_ips:
            anomalies.append({
                "type": "PathDeviation",
                "detail": f"跳点 {idx+1} 出现新IP {ip}"
            })
        if latency and latency > 200:
            anomalies.append({
                "type": "HighLatency",
                "detail": f"跳点 {idx+1} ({ip}) 延迟过高 {latency}ms"
            })
    return anomalies

def guarder_risk_score(hops):
    score = 0
    alerts = []
    for hop in hops:
        ip = hop.get("ip")
        if ip in RISKY_IPS:
            score += 40
            alerts.append(f"跳点 {ip} 被列为恶意IP: {RISKY_IPS[ip]}")
    return score, alerts

def load_recent_history(ip, limit=5):
    ip_dir = os.path.join(HISTORY_DIR, ip)
    if not os.path.exists(ip_dir):
        return []
    history = []
    for file in sorted(os.listdir(ip_dir), reverse=True)[:limit]:
        with open(os.path.join(ip_dir, file), "r") as f:
            try:
                history.append(json.load(f))
            except:
                pass
    return history

@app.route("/api/analyze", methods=["GET"])
def analyze_route():
    target = request.args.get("target")
    use_cache = request.args.get("cache", "true").lower() == "true"
    if not target:
        return jsonify({"error": "Missing target"}), 400

    ip = get_ip_from_url(target) if not target.replace(".", "").isdigit() else target
    ip_dir = os.path.join(HISTORY_DIR, ip)
    os.makedirs(ip_dir, exist_ok=True)

    # 获取当前 hops
    if use_cache and os.path.exists(ip_dir):
        files = sorted(os.listdir(ip_dir), reverse=True)
        if files:
            with open(os.path.join(ip_dir, files[0]), "r") as f:
                current_hops = json.load(f)
        else:
            current_hops = []
    else:
        current_hops = []
        for line in run_traceroute(target, ip):
            current_hops.append(json.loads(line.strip()))

    # 历史对比分析
    history = load_recent_history(ip)
    anomalies = analyze_anomalies(current_hops, history)

    # 风险分析
    risk_score, alerts = guarder_risk_score(current_hops)
    alerts += [a["detail"] for a in anomalies]
    total_score = min(risk_score + len(anomalies) * 10, 100)

    return jsonify({
        "anomalies": anomalies,
        "alerts": alerts,
        "riskScore": total_score
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)
