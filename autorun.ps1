#Requires -RunAsAdministrator
param(
    [switch]$UseProxy,
    [string]$ProxyHost = "127.0.0.1:7890",
    [switch]$SkipConfirm
)
$ErrorActionPreference = "Stop"

# ---------- 代理开关 ----------
function Use-ProxyIfNeeded {
    param([scriptblock]$Script)
    if ($UseProxy) {
        $oldHttp  = [Environment]::GetEnvironmentVariable("HTTP_PROXY")
        $oldHttps = [Environment]::GetEnvironmentVariable("HTTPS_PROXY")
        [Environment]::SetEnvironmentVariable("HTTP_PROXY",  "http://$ProxyHost", "Process")
        [Environment]::SetEnvironmentVariable("HTTPS_PROXY", "http://$ProxyHost", "Process")
        try { & $Script }
        finally {
            [Environment]::SetEnvironmentVariable("HTTP_PROXY",  $oldHttp,  "Process")
            [Environment]::SetEnvironmentVariable("HTTPS_PROXY", $oldHttps, "Process")
        }
    } else { & $Script }
}

# ---------- 工具检测 ----------
function Test-Cmd { param($cmd); $null -ne (Get-Command $cmd -ErrorAction SilentlyContinue) }

# ---------- 用户确认 ----------
if (-not $SkipConfirm) {
    Write-Host "警告：此脚本仅适用于 Windows 10/11 64 位"
    Write-Host "建议使用Windows Terminal终端"
    Write-Host "默认执行命令.\drpys.ps1"
    Write-Host "下载失败可以指定旁路由代理执行命令.\drpys.ps1 -UseProxy -ProxyHost "旁路由/clash:7890""
    Write-Host "警告：此脚本仅适用于 Windows 10/11 64 位"
    $confirm = Read-Host "您是否理解并同意继续？(y/n) 默认(y)"
    if ($confirm -eq "n") { exit 1 }
}

# ---------- 安装 Node ----------
Use-ProxyIfNeeded -Script {
    if (Test-Cmd "node") {
        $nodeVer = (node -v) -replace '^v','' -split '\.' | ForEach-Object { [int]$_ }
        if ($nodeVer[0] -ge 20) {
            Write-Host "已检测到 Node v$($nodeVer -join '.') ≥20，跳过安装"
        } else {
            if (-not (Test-Cmd "nvm")) {
                Write-Host "正在安装 nvm-windows..."
                $nvmSetup = "$env:TEMP\nvm-setup.exe"
                Invoke-WebRequest "https://download.fastgit.org/coreybutler/nvm-windows/releases/latest/download/nvm-setup.exe" -OutFile $nvmSetup
                Start-Process -Wait -FilePath $nvmSetup -ArgumentList "/silent"
                Remove-Item $nvmSetup
                $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
            }
            nvm install 20
            nvm use 20
        }
    } else {
        if (-not (Test-Cmd "nvm")) {
            Write-Host "正在安装 nvm-windows..."
            $nvmSetup = "$env:TEMP\nvm-setup.exe"
            Invoke-WebRequest "https://download.fastgit.org/coreybutler/nvm-windows/releases/latest/download/nvm-setup.exe" -OutFile $nvmSetup
            Start-Process -Wait -FilePath $nvmSetup -ArgumentList "/silent"
            Remove-Item $nvmSetup
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        }
        nvm install 20
        nvm use 20
    }

    foreach ($tool in @("yarn","pm2","git","python")) {
        if (-not (Test-Cmd $tool)) {
            switch ($tool) {
                "yarn" { npm install -g yarn }
                "pm2"  { npm install -g pm2  }
                "git"  { winget install --id Git.Git -e --source winget }
                "python" { winget install --id Python.Python.3 -e --source winget }
            }
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        }
    }
}

# ---------- 工作目录 ----------
$repoDir = Read-Host "请输入项目存放目录（留空则使用当前目录）"
if ([string]::IsNullOrWhiteSpace($repoDir)) { $repoDir = (Get-Location).Path }
$projectPath = Join-Path $repoDir "drpy-node"
$remoteRepo  = "https://github.com/hjdhnx/drpy-node.git"

# ---------- 首次克隆 / 配置 ----------
Use-ProxyIfNeeded -Script {
    if (-not (Test-Path $projectPath)) {
        Write-Host "正在克隆仓库..."
        git clone $remoteRepo $projectPath
    }
    Set-Location $projectPath

    # 初始化配置
    $configJson = "config\env.json"
    if (-not (Test-Path $configJson)) {
        @{
            ali_token = ""; ali_refresh_token = ""; quark_cookie = "";
            uc_cookie = ""; bili_cookie = ""; thread = "10";
            enable_dr2 = "1"; enable_py = "2"
        } | ConvertTo-Json | Set-Content $configJson -Encoding UTF8
    }

    $envFile = ".env"
    if (-not (Test-Path $envFile)) {
        Copy-Item ".env.development" $envFile
        $cookieAuth = Read-Host "网盘入库密码（默认 drpys）"
        $apiUser    = Read-Host "登录用户名（默认 admin）"
        $apiPass    = Read-Host "登录密码（默认 drpys）"
        $apiPwd     = Read-Host "订阅PWD值（默认 dzyyds）"
        (Get-Content $envFile) `
            -replace 'COOKIE_AUTH_CODE = .*', "COOKIE_AUTH_CODE = $(if([string]::IsNullOrWhiteSpace($cookieAuth)){'drpys'}else{$cookieAuth})" `
            -replace 'API_AUTH_NAME = .*',    "API_AUTH_NAME = $(if([string]::IsNullOrWhiteSpace($apiUser)){'admin'}else{$apiUser})" `
            -replace 'API_AUTH_CODE = .*',    "API_AUTH_CODE = $(if([string]::IsNullOrWhiteSpace($apiPass)){'drpys'}else{$apiPass})" `
            -replace 'API_PWD = .*',          "API_PWD = $(if([string]::IsNullOrWhiteSpace($apiPwd)){'dzyyds'}else{$apiPwd})" |
                Set-Content $envFile -Encoding UTF8
    }

    # 首次安装依赖
    if (-not (Test-Path "node_modules")) {
        Write-Host "首次安装 Node 依赖..."
        yarn config set registry https://registry.npmmirror.com/
        yarn
    }
    if (-not (Test-Path ".venv\pyvenv.cfg")) {
        Write-Host "首次创建 Python 虚拟环境..."
        python -m venv .venv
    }
    & .\.venv\Scripts\Activate.ps1
    if ((git diff HEAD^ HEAD --name-only 2>$null) -match "requirements.txt") {
        Write-Host "检测到 requirements.txt 变动，更新 Python 依赖..."
        pip install -r spider\py\base\requirements.txt -i https://mirrors.cloud.tencent.com/pypi/simple
    }

    # 首次或 PM2 未启动时启动
    if (-not (pm2 list | Select-String "drpyS.*online")) {
        Write-Host "首次启动 PM2 进程..."
        pm2 start index.js --name drpyS --update-env
        pm2 save
    } else {
        Write-Host "PM2 进程 drpyS 已在运行，跳过启动"
    }
}

# ---------- 任务计划 ----------
$taskStartup = "drpyS_PM2_Startup"
$taskUpdate  = "drpyS_Update"

if (-not (Get-ScheduledTask -TaskName $taskStartup -ErrorAction SilentlyContinue)) {
    $action  = New-ScheduledTaskAction -Execute "powershell.exe" `
                -Argument "-NoProfile -WindowStyle Hidden -Command pm2 resurrect"
    $trigger = New-ScheduledTaskTrigger -AtStartup -RandomDelay (New-TimeSpan -Seconds 30)
    $setting = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
    Register-ScheduledTask -TaskName $taskStartup -Action $action -Trigger $trigger `
        -Settings $setting -User "SYSTEM" -RunLevel Highest -Force | Out-Null
    Write-Host "已创建开机自启任务：$taskStartup"
}

if (-not (Get-ScheduledTask -TaskName $taskUpdate -ErrorAction SilentlyContinue)) {
    $action  = New-ScheduledTaskAction -Execute "powershell.exe" `
                -Argument "-NoProfile -WindowStyle Hidden -Command `"& { cd '$projectPath'; git fetch origin; if (git status -uno | Select-String 'Your branch is behind') { git reset --hard origin/main; yarn --prod --silent; if (git diff HEAD^ HEAD --name-only | Select-String 'spider/py/base/requirements.txt') { python -m venv .venv; & .\.venv\Scripts\Activate.ps1; pip install -r spider\py\base\requirements.txt -q } pm2 restart drpyS } }`""
    $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Hours 24)
    $setting = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
    Register-ScheduledTask -TaskName $taskUpdate -Action $action -Trigger $trigger `
        -Settings $setting -User "SYSTEM" -RunLevel Highest -Force | Out-Null
    Write-Host "已创建每 24 小时更新任务：$taskUpdate"
}

# ---------- 完成 ----------
$ip     = (ipconfig | Select-String "IPv4 地址" | Select-Object -First 1).ToString().Split(":")[-1].Trim()
$public = (Invoke-RestMethod "https://ipinfo.io/ip")
Write-Host "内网地址：http://${ip}:5757"
Write-Host "公网地址：http://${public}:5757"
Write-Host "脚本执行完成！重启后 drpyS 自动启动并每 24 小时检查更新。"
Write-Host "脚本只需要执行一次不需要重复执行。"
Write-Host "如果弹出空白窗口可以直接关闭不影响使用。"