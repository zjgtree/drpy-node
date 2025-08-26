param(
    [switch]$UseProxy,
    [string]$ProxyHost = "127.0.0.1:7890",
    [switch]$SkipConfirm
)
$ErrorActionPreference = "Stop"

# 自动提权 & 切回脚本目录
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "当前非管理员权限，正在尝试以管理员身份重新启动..." -ForegroundColor Yellow
    $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$($MyInvocation.MyCommand.Path)`""
    if ($UseProxy)    { $arguments += " -UseProxy -ProxyHost `"$ProxyHost`"" }
    if ($SkipConfirm) { $arguments += " -SkipConfirm" }
    Start-Process powershell -ArgumentList $arguments -Verb RunAs
    exit
}
Set-Location -LiteralPath $PSScriptRoot

# ---------- 代理 ----------
function Use-ProxyIfNeeded {
    param([scriptblock]$Script)
    if ($UseProxy) {
        $oldHttp  = [Environment]::GetEnvironmentVariable("HTTP_PROXY")
        $oldHttps = [Environment]::GetEnvironmentVariable("HTTPS_PROXY")
        [Environment]::SetEnvironmentVariable("HTTP_PROXY",  "http://$ProxyHost", "Process")
        [Environment]::SetEnvironmentVariable("HTTPS_PROXY", "http://$ProxyHost", "Process")
        try { & $Script } finally {
            [Environment]::SetEnvironmentVariable("HTTP_PROXY",  $oldHttp,  "Process")
            [Environment]::SetEnvironmentVariable("HTTPS_PROXY", $oldHttps, "Process")
        }
    } else { & $Script }
}
function Test-Cmd { param($cmd); $null -ne (Get-Command $cmd -ErrorAction SilentlyContinue) }
function Invoke-WebRequestWithProxy([string]$Url, [string]$OutFile) {
    if ($UseProxy) { Invoke-WebRequest $Url -OutFile $OutFile -Proxy "http://$ProxyHost" }
    else           { Invoke-WebRequest $Url -OutFile $OutFile }
}

# ---------- 用户确认 ----------
if (-not $SkipConfirm) {
    Write-Host "警告：此脚本仅适用于 Windows 10/11 64 位" -ForegroundColor Green
    Write-Host "建议使用 Windows Terminal 终端管理员方式运行" -ForegroundColor Green
    Write-Host "如果 nvm、git、python 安装失败，建议手动安装" -ForegroundColor Green
    Write-Host "下载失败可指定旁路由代理：.\drpys-final.ps1 -UseProxy -ProxyHost `"192.168.1.21:7890`"" -ForegroundColor Green
    Write-Host "如果旁路由也下载失败那就换成道长那个白嫖地址" -ForegroundColor Green
    $confirm = Read-Host "您是否理解并同意继续？(y/n) 默认(y)"
    if ($confirm -eq "n") { exit 1 }
}

# ---------- 安装 Node / nvm / git / python ----------
Use-ProxyIfNeeded -Script {
    $needNode = $false
    if (Test-Cmd "node") {
        # 取出三段版本号
        $nodeVer = (node -v) -replace '^v','' -split '\.' | ForEach-Object { [int]$_ }
        # 构造一个可比较的整数：主*10000 + 次*100 + 修订
        $current = $nodeVer[0]*10000 + $nodeVer[1]*100 + $nodeVer[2]
        $require = 20*10000 + 18*100 + 3          # 20.18.3
        if ($current -ge $require) {
            Write-Host "已检测到 Node v$($nodeVer -join '.') ≥20.18.3，跳过安装" -ForegroundColor Green
        } else {
            Write-Host "Node 版本低于 20.18.3，将使用 nvm 安装/切换到 20.18.3" -ForegroundColor Yellow
            $needNode = $true
        }
    } else {
        Write-Host "未检测到 Node，准备安装" -ForegroundColor Yellow
        $needNode = $true
    }

    if (-not (Test-Cmd "nvm")) {
        Write-Host "正在安装 nvm-windows..." -ForegroundColor Green
        $nvmSetup = "$env:TEMP\nvm-setup.exe"
        Invoke-WebRequestWithProxy "https://github.com/coreybutler/nvm-windows/releases/latest/download/nvm-setup.exe" $nvmSetup
        Start-Process -Wait -FilePath $nvmSetup -ArgumentList "/silent"
        Remove-Item $nvmSetup
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    } else {
        Write-Host "已检测到 nvm，跳过安装" -ForegroundColor Green
    }

    if ($needNode) {
        nvm install 20.18.3
        nvm use 20.18.3
    }

    # ---------- 安装 Python 3.11 ----------
    $pyExe = "python-3.11.9-amd64.exe"
    $pyUrl = "https://www.python.org/ftp/python/3.11.9/$pyExe"
    $pyDir = "C:\Python311"
    $needPy = $false

    if (Test-Cmd "python") {
        $ver = (& python -V 2>&1) -replace 'Python ',''
        if ($ver -match '^3\.11') {
            Write-Host "已检测到 Python 3.11 ($ver)，跳过安装" -ForegroundColor Green
        } else {
            Write-Host "检测到非 3.11 版本，准备覆盖安装 3.11" -ForegroundColor Yellow
            $needPy = $true
        }
    } else {
        Write-Host "未检测到 Python，准备安装 3.11" -ForegroundColor Yellow
        $needPy = $true
    }

    if ($needPy) {
        Write-Host "正在下载并安装 Python 3.11..." -ForegroundColor Green
        $exePath = "$env:TEMP\$pyExe"
        Invoke-WebRequestWithProxy $pyUrl $exePath
        $proc = Start-Process -FilePath $exePath -ArgumentList `
            "/quiet InstallAllUsers=1 TargetDir=$pyDir PrependPath=1" -PassThru
        $proc.WaitForExit()
        Remove-Item $exePath
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        if (-not (Test-Cmd "python")) {
            Write-Error "Python 3.11 安装失败，脚本终止"
            exit 1
        }
    }

    $tools = @{
        yarn   = { npm install -g yarn }
        pm2    = { npm install -g pm2 }
        git    = { winget install --id Git.Git -e --source winget }
    }
    foreach ($kv in $tools.GetEnumerator()) {
        $cmd = $kv.Key
        if (-not (Test-Cmd $cmd)) {
            Write-Host "正在安装 $cmd ..." -ForegroundColor Yellow
            & $kv.Value
        } else {
            Write-Host "已检测到 $cmd，跳过安装" -ForegroundColor Green
        }
    }
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
}

# ---------- 工作目录 ----------
$repoDir = Read-Host "请输入项目存放目录（留空则使用当前目录）"
if ([string]::IsNullOrWhiteSpace($repoDir)) { $repoDir = (Get-Location).Path }
$projectPath = Join-Path $repoDir "drpy-node"
$remoteRepo  = "https://github.com/hjdhnx/drpy-node.git"

# ---------- 首次克隆 / 配置 ----------
Use-ProxyIfNeeded -Script {
    if (-not (Test-Path $projectPath)) {
        Write-Host "正在克隆仓库..." -ForegroundColor Yellow
        if ($UseProxy) {
            git -c http.proxy="http://$ProxyHost" clone $remoteRepo $projectPath
        } else {
            git clone $remoteRepo $projectPath
        }
    }
    Set-Location $projectPath

    # ---------- 生成 env.json（目录不存在则创建，UTF-8 无 BOM） ----------
    $configDir  = Join-Path $projectPath "config"
    $configJson = Join-Path $configDir "env.json"
    if (-not (Test-Path $configDir)) {
        New-Item -ItemType Directory -Path $configDir -Force | Out-Null
    }
    if (-not (Test-Path $configJson)) {
        $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
        $jsonText  = @{
            ali_token = ""; ali_refresh_token = ""; quark_cookie = ""
            uc_cookie = ""; bili_cookie = ""; thread = "10"
            enable_dr2 = "1"; enable_py = "2"
        } | ConvertTo-Json
        [System.IO.File]::WriteAllLines($configJson, $jsonText, $utf8NoBom)
    }

    # ---------- 生成 .env（复制后重写为 UTF-8 无 BOM） ----------
    $envFile = Join-Path $projectPath ".env"
    if (-not (Test-Path $envFile)) {
        $template = Join-Path $projectPath ".env.development"
        Copy-Item $template $envFile

        # 强制无 BOM 重写
        $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
        $content   = [System.IO.File]::ReadAllText($envFile)
        [System.IO.File]::WriteAllText($envFile, $content, $utf8NoBom)

        # 交互式替换
        $cookieAuth = Read-Host "网盘入库密码（默认 drpys）"
        $apiUser    = Read-Host "登录用户名（默认 admin）"
        $apiPass    = Read-Host "登录密码（默认 drpys）"
        $apiPwd     = Read-Host "订阅PWD值（默认 dzyyds）"

        $newContent = [System.IO.File]::ReadAllText($envFile) `
            -replace '(?<=^COOKIE_AUTH_CODE\s*=\s*).*$', $(if([string]::IsNullOrWhiteSpace($cookieAuth)){'drpys'}else{$cookieAuth}) `
            -replace '(?<=^API_AUTH_NAME\s*=\s*).*$',    $(if([string]::IsNullOrWhiteSpace($apiUser)){'admin'}else{$apiUser}) `
            -replace '(?<=^API_AUTH_CODE\s*=\s*).*$',    $(if([string]::IsNullOrWhiteSpace($apiPass)){'drpys'}else{$apiPass}) `
            -replace '(?<=^API_PWD\s*=\s*).*$',          $(if([string]::IsNullOrWhiteSpace($apiPwd)){'dzyyds'}else{$apiPwd})
        [System.IO.File]::WriteAllText($envFile, $newContent, $utf8NoBom)
    }

    # Node 依赖
    if (-not (Test-Path "node_modules")) {
        Write-Host "首次安装 Node 依赖..." -ForegroundColor Yellow
        yarn config set registry https://registry.npmmirror.com/
        yarn install
    } elseif ((git diff HEAD^ HEAD --name-only 2>$null) -match [regex]::Escape("yarn.lock")) {
        Write-Host "检测到 yarn.lock 变动，更新 Node 依赖..." -ForegroundColor Yellow
        yarn install --registry https://registry.npmmirror.com/
    }

    # Python 依赖
    if (-not (Test-Path ".venv\pyvenv.cfg")) {
        Write-Host "首次创建 Python 虚拟环境..." -ForegroundColor Yellow
        python -m venv .venv
        & .\.venv\Scripts\Activate.ps1
        Write-Host "首次安装 Python 依赖..." -ForegroundColor Yellow
        python.exe -m pip install --upgrade pip
        pip install -r spider\py\base\requirements.txt -i https://mirrors.cloud.tencent.com/pypi/simple
    } else {
        & .\.venv\Scripts\Activate.ps1
        if ((git diff HEAD^ HEAD --name-only 2>$null) -match [regex]::Escape("spider\py\base\requirements.txt")) {
            Write-Host "检测到 requirements.txt 变动，更新 Python 依赖..." -ForegroundColor Yellow
            pip install -r spider\py\base\requirements.txt -i https://mirrors.cloud.tencent.com/pypi/simple
        }
    }

    if (-not (pm2 list | Select-String "drpyS.*online")) {
        Write-Host "首次启动 PM2 进程..." -ForegroundColor Yellow
        pm2 start index.js --name drpyS --update-env
        pm2 save
    } else {
        Write-Host "PM2 进程 drpyS 已在运行，跳过启动" -ForegroundColor Green
    }
}

# ---------- 任务计划 ----------
$taskStartup = "drpyS_PM2_Startup"
$taskUpdate  = "drpyS_Update"

$pm2     = (Get-Command pm2.cmd  -ErrorAction SilentlyContinue).Source
$nodeExe = (Get-Command node.exe -ErrorAction SilentlyContinue).Source

if ($pm2 -and $nodeExe) {
    $taskStartup,$taskUpdate | ForEach-Object {
        if (Get-ScheduledTask -TaskName $_ -ErrorAction SilentlyContinue) {
            Unregister-ScheduledTask -TaskName $_ -Confirm:$false
        }
    }

    $commonSettings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

    # 开机自启
    $action  = New-ScheduledTaskAction `
        -Execute "powershell.exe" `
        -Argument "-NoProfile -ExecutionPolicy Bypass -Command `"& { `$env:PM2_HOME='C:\$env:USERNAME\.pm2'; Set-Location '$projectPath'; & '$pm2' start '$projectPath\index.js' --name drpyS --update-env }`"" `
        -WorkingDirectory $projectPath
    $trigger = New-ScheduledTaskTrigger -AtStartup -RandomDelay (New-TimeSpan -Seconds 30)
    Register-ScheduledTask -TaskName $taskStartup -Action $action -Trigger $trigger -Settings $commonSettings -User "SYSTEM" -RunLevel Highest -Force | Out-Null
    Write-Host "已创建/更新开机自启任务：$taskStartup" -ForegroundColor Green

    # 每 6 小时更新
    $action  = New-ScheduledTaskAction `
        -Execute "powershell.exe" `
        -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command `"& { `$env:PM2_HOME='C:\$env:USERNAME\.pm2'; Set-Location '$projectPath'; git fetch origin; if (git status -uno | Select-String 'Your branch is behind') { git reset --hard origin/main; yarn install --registry https://registry.npmmirror.com/; pip install -r spider\py\base\requirements.txt -i https://mirrors.cloud.tencent.com/pypi/simple; & '$pm2' restart drpyS } }`"" `
        -WorkingDirectory $projectPath
    $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Hours 6)
    Register-ScheduledTask -TaskName $taskUpdate -Action $action -Trigger $trigger -Settings $commonSettings -User "SYSTEM" -RunLevel Highest -Force | Out-Null
    Write-Host "已创建/更新每 6 小时更新任务：$taskUpdate" -ForegroundColor Green
}

# ------ 退出虚拟环境 ------
deactivate
# ---------- 完成 ----------
$ip = (ipconfig | Select-String "IPv4 地址" | Select-Object -First 1).ToString().Split(":")[-1].Trim()
$public = (Invoke-RestMethod "https://ipinfo.io/ip")
Write-Host "内网地址：http://${ip}:5757" -ForegroundColor Green
Write-Host "公网地址：http://${public}:5757" -ForegroundColor Green
Write-Host "脚本执行完成！重启后 drpyS 自动启动并每 6 小时检查更新。" -ForegroundColor Green
Write-Host "按任意键退出！！！" -ForegroundColor Green
Read-Host
