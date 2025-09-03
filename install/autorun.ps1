<#
.SYNOPSIS
    drpy-node 一站式安装脚本（增强版）
.DESCRIPTION
    一键安装/更新 nvm、Node、Python、Git，克隆项目，配置 env，创建 PM2 开机+定时任务。
    支持自定义更新策略（是否检查、是否同步、代理、间隔）。
.EXAMPLE
    .\drpys-auto.ps1
    .\drpys-auto.ps1 -UseProxy -ProxyHost 192.168.1.21:7890 -SkipConfirm
#>
param(
    [switch]$UseProxy,
    [string]$ProxyHost = "127.0.0.1:7890",
    [switch]$SkipConfirm
)
$ErrorActionPreference = "Stop"

# -------------------------------------------------
# 0. 工具函数
# -------------------------------------------------
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

# -------------------------------------------------
# 1. 自动提权 & 回到脚本目录
# -------------------------------------------------
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "当前非管理员权限，正在尝试以管理员身份重新启动，如果闪退请走代理..." -ForegroundColor Yellow
    $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$($MyInvocation.MyCommand.Path)`""
    if ($UseProxy)    { $arguments += " -UseProxy -ProxyHost `"$ProxyHost`"" }
    if ($SkipConfirm) { $arguments += " -SkipConfirm" }
    Start-Process powershell -ArgumentList $arguments -Verb RunAs
    exit
}
Set-Location -LiteralPath $PSScriptRoot

# -------------------------------------------------
# 2. 按需安装 winget
# -------------------------------------------------
function Install-Winget {
    if (Test-Cmd winget) { return }
    Write-Host "未检测到 winget，正在安装 App Installer..." -ForegroundColor Yellow
    $url = "https://aka.ms/getwinget"
    $out = "$env:TEMP\Microsoft.DesktopAppInstaller_8wekyb3d8bbwe.msixbundle"
    Invoke-WebRequestWithProxy $url $out
    Add-AppxPackage -Path $out -ErrorAction SilentlyContinue
    Remove-Item $out
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
}

# ------------------------------------------------------------------
# 3. 用户确认
# ------------------------------------------------------------------
if (-not $SkipConfirm) {
    Write-Host @"
警告：此脚本仅适用于 Windows 10/11 64 位
建议使用 Windows Terminal 并以管理员方式运行
如果 nvm、git、python 安装失败，请手动安装
下载失败可指定代理：.\drpys-auto.ps1 -UseProxy -ProxyHost "192.168.1.21:7890"
如果旁路由也失败可换用白嫖地址
"@ -ForegroundColor Green
    $confirm = Read-Host "您是否理解并同意继续？(y/n) 默认(y)"
    if ($confirm -eq "n") { exit 1 }
}

# ------------------------------------------------------------------
# 4. 安装 nvm-windows
# ------------------------------------------------------------------
if (-not (Test-Cmd "nvm")) {
    Write-Host "正在安装 nvm-windows..." -ForegroundColor Green
    $nvmSetup = "$env:TEMP\nvm-setup.exe"
    Invoke-WebRequestWithProxy "https://github.com/coreybutler/nvm-windows/releases/latest/download/nvm-setup.exe" $nvmSetup
    Start-Process -Wait -FilePath $nvmSetup -ArgumentList "/silent"
    Remove-Item $nvmSetup
    Write-Host ""
    Write-Host "--------------------------------------------------" -ForegroundColor Yellow
    Write-Host "nvm 已安装完毕，但当前 PowerShell 会话尚未识别到它。" -ForegroundColor Yellow
    Write-Host "请执行以下任意一步后再继续："                         -ForegroundColor Cyan
    Write-Host "  1) 关闭本窗口，重新打开一个『管理员』PowerShell后，再次执行脚本；"      -ForegroundColor Cyan
    Write-Host "  2) 或者再次右键选PS运行本脚本。"                         -ForegroundColor Cyan
    Write-Host "--------------------------------------------------" -ForegroundColor Yellow
    Read-Host "按 Enter 键退出本窗口"
    exit
} else {
    Write-Host "已检测到 nvm，跳过安装" -ForegroundColor Green
}

# -------------------------------------------------
# 5. 安装/切换 Node
# -------------------------------------------------
$needNode = $false
if (Test-Cmd "node") {
    $nodeVer = (node -v) -replace '^v','' -split '\.' | ForEach-Object { [int]$_ }
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
if ($needNode) {
    nvm install 20.18.3
    nvm use 20.18.3
}

# -------------------------------------------------
# 6. 安装 Python 3.11（优先 winget）
# -------------------------------------------------
$pyNeed = $false
try {
    $ver = (python -V 2>$null) -replace 'Python ',''
    if ($ver -match '^3\.11') {
        Write-Host "已检测到 Python 3.11 ($ver)，跳过安装" -ForegroundColor Green
    } else {
        Write-Host "检测到非 3.11 版本，准备覆盖安装 3.11" -ForegroundColor Yellow
        $pyNeed = $true
    }
} catch {
    Write-Host "未检测到 Python，准备安装 3.11" -ForegroundColor Yellow
    $pyNeed = $true
}
if ($pyNeed) {
    Install-Winget
    Write-Host "正在通过 winget 安装 Python 3.11..." -ForegroundColor Green
    winget install --id Python.Python.3.11 -e --accept-source-agreements --accept-package-agreements
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
}

# -------------------------------------------------
# 7. 安装 Git：winget 优先，失败自动离线
# -------------------------------------------------
if (-not (Test-Cmd "git")) {
    # 1) winget 交互式安装
    Install-Winget
    if (Test-Cmd winget) {
        Write-Host "正在通过 winget 安装 Git（交互模式）..." -ForegroundColor Green
        try {
            winget install --id Git.Git -e --source winget
            if (Test-Cmd git) {
                Write-Host "Git 安装成功（winget）" -ForegroundColor Green
                $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
                continue
            }
        } catch {
            Write-Host "winget 安装失败，将使用离线包..." -ForegroundColor Yellow
        }
    }

    # 2) winget 失败 → 离线安装
    Write-Host "正在解析 Git 最新版本..." -ForegroundColor Green
    try {
        $latestUri = (Invoke-WebRequest -Uri "https://github.com/git-for-windows/git/releases/latest" -MaximumRedirection 0 -ErrorAction SilentlyContinue).Headers.Location
        $ver = if ($latestUri) { $latestUri -replace '.*/tag/v([0-9.]+).*$','$1' } else { "2.51.0" }
    } catch {
        $ver = "2.51.0"
    }

    Write-Host "正在下载 Git $ver ..." -ForegroundColor Green
    $gitSetup = "$env:TEMP\Git-$ver-64-bit.exe"
    $gitUrl   = "https://github.com/git-for-windows/git/releases/download/v$ver.windows.1/Git-$ver-64-bit.exe"
    Invoke-WebRequestWithProxy $gitUrl $gitSetup
    Start-Process -Wait -FilePath $gitSetup -ArgumentList "/VERYSILENT /NORESTART /NOCANCEL /SP- /CLOSEAPPLICATIONS /RESTARTAPPLICATIONS"
    Remove-Item $gitSetup -Force
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
} else {
    Write-Host "已检测到 Git，跳过安装" -ForegroundColor Green
}

# -------------------------------------------------
# 8. 安装全局 npm 工具
# -------------------------------------------------
$tools = @{
    yarn = { npm install -g yarn }
    pm2  = { npm install -g pm2 }
}
foreach ($kv in $tools.GetEnumerator()) {
    if (-not (Test-Cmd $kv.Key)) {
        Write-Host "正在安装 $($kv.Key) ..." -ForegroundColor Yellow
        & $kv.Value
    } else {
        Write-Host "已检测到 $($kv.Key)，跳过安装" -ForegroundColor Green
    }
}
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

# -------------------------------------------------
# 9. 克隆仓库 / 配置 / 依赖 / PM2
# -------------------------------------------------
$repoDir = Read-Host "请输入项目存放目录（留空则使用当前目录）"
if ([string]::IsNullOrWhiteSpace($repoDir)) { $repoDir = (Get-Location).Path }
$projectPath = Join-Path $repoDir "drpy-node"
$remoteRepo  = "https://github.com/hjdhnx/drpy-node.git"

# 记录路径供后续计划任务使用
$pathFile = Join-Path $PSScriptRoot "drpys-path.txt"
$projectPath | Out-File $pathFile -Encoding UTF8 -Force

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

    # 生成 env.json
    $configDir  = Join-Path $projectPath "config"
    $configJson = Join-Path $configDir "env.json"
    if (-not (Test-Path $configDir)) { New-Item -ItemType Directory -Path $configDir -Force | Out-Null }
    if (-not (Test-Path $configJson)) {
        $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
        $jsonText  = @{
            ali_token = ""; ali_refresh_token = ""; quark_cookie = ""
            uc_cookie = ""; bili_cookie = ""; thread = "10"
            enable_dr2 = "1"; enable_py = "2"
        } | ConvertTo-Json
        [System.IO.File]::WriteAllLines($configJson, $jsonText, $utf8NoBom)
    }

# 生成 .env（UTF-8 无 BOM，不乱码）
$envFile = Join-Path $projectPath ".env"
if (-not (Test-Path $envFile)) {
    # 如果仓库没带模板，就写一份最小模板（同样无 BOM）
    $template = Join-Path $projectPath ".env.development"
    if (-not (Test-Path $template)) {
        @"
NODE_ENV=development
COOKIE_AUTH_CODE=drpys
API_AUTH_NAME=admin
API_AUTH_CODE=drpys
API_PWD=dzyyds
"@ | Out-File $template -Encoding UTF8
    }

    # 复制模板
    Copy-Item $template $envFile

    # 依次输入
    $cookieAuth = (Read-Host "网盘入库密码（默认 drpys）").Trim()
    $apiUser    = (Read-Host "登录用户名（默认 admin）").Trim()
    $apiPass    = (Read-Host "登录密码（默认 drpys）").Trim()
    $apiPwd     = (Read-Host "订阅PWD值（默认 dzyyds）").Trim()

    # 空值兜底
    if ([string]::IsNullOrWhiteSpace($cookieAuth)) { $cookieAuth = 'drpys' }
    if ([string]::IsNullOrWhiteSpace($apiUser))    { $apiUser    = 'admin' }
    if ([string]::IsNullOrWhiteSpace($apiPass))    { $apiPass    = 'drpys' }
    if ([string]::IsNullOrWhiteSpace($apiPwd))     { $apiPwd     = 'dzyyds' }

    # 逐行替换，最后统一 UTF-8 无 BOM 写回
    $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
    $lines = [System.IO.File]::ReadAllLines($template, $utf8NoBom)

    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match '^\s*COOKIE_AUTH_CODE\s*=') {
            $lines[$i] = "COOKIE_AUTH_CODE = $cookieAuth"
        }
        elseif ($lines[$i] -match '^\s*API_AUTH_NAME\s*=') {
            $lines[$i] = "API_AUTH_NAME = $apiUser"
        }
        elseif ($lines[$i] -match '^\s*API_AUTH_CODE\s*=') {
            $lines[$i] = "API_AUTH_CODE = $apiPass"
        }
        elseif ($lines[$i] -match '^\s*API_PWD\s*=') {
            $lines[$i] = "API_PWD = $apiPwd"
        }
    }

    [System.IO.File]::WriteAllLines($envFile, $lines, $utf8NoBom)
}

    # Node 依赖
    if (-not (Test-Path "node_modules")) {
        Write-Host "首次安装 Node 依赖..." -ForegroundColor Yellow
        yarn config set registry https://registry.npmmirror.com/
        yarn
    } elseif ((git diff HEAD^ HEAD --name-only 2>$null) -match [regex]::Escape("yarn.lock")) {
        Write-Host "检测到 yarn.lock 变动，更新 Node 依赖..." -ForegroundColor Yellow
        yarn install --registry https://registry.npmmirror.com/
    }

    # Python 虚拟环境 & 依赖
    $venvActivate = Join-Path $projectPath ".venv\Scripts\Activate.ps1"
    if (-not (Test-Path ".venv\pyvenv.cfg")) {
        Write-Host "首次创建 Python 虚拟环境..." -ForegroundColor Yellow
        python -m venv .venv
    }
    & $venvActivate
    python -m pip install --upgrade pip -q
    pip install -r spider\py\base\requirements.txt -i https://mirrors.cloud.tencent.com/pypi/simple -q

    if ((git diff HEAD^ HEAD --name-only 2>$null) -match [regex]::Escape("spider\py\base\requirements.txt")) {
        Write-Host "检测到 requirements.txt 变动，更新 Python 依赖..." -ForegroundColor Yellow
        pip install -r spider\py\base\requirements.txt -i https://mirrors.cloud.tencent.com/pypi/simple -q
    }

    # PM2
    if (-not (pm2 list | Select-String "drpyS.*online")) {
        Write-Host "首次启动 PM2 进程..." -ForegroundColor Yellow
        pm2 start index.js --name drpyS --update-env
        pm2 save
    } else {
        Write-Host "PM2 进程 drpyS 已在运行，跳过启动" -ForegroundColor Green
    }
}

# ------------------------------------------------------------------
# 10. 增强版计划任务（开机自启 + 可配置定时更新）
# ------------------------------------------------------------------
$confFile  = Join-Path $PSScriptRoot "drpys-update.conf"
$pathFile  = Join-Path $PSScriptRoot "drpys-path.txt"
$projectPath = (Get-Content $pathFile).Trim()

# 首次/重设配置向导
if (-not (Test-Path $confFile)) {
    Write-Host "`n【定时更新配置向导】`n" -ForegroundColor Cyan
    $checkUpdate = Read-Host "是否启用检查更新？(y/n, 默认 y)"
    $syncCode    = Read-Host "是否自动同步源码？(y/n, 默认 y)"
    $proxyChoice = Read-Host "代理策略：`n 1) 手动`n 2) 自动检测(默认)`n 3) 关闭`n请选择(1/2/3)"
    switch ($proxyChoice) {
        '1' { $proxy = Read-Host "请输入代理地址"; $proxyMode='manual' }
        '3' { $proxyMode='off'; $proxy='' }
        default { $proxyMode='auto'; $proxy='' }
    }
    $unit  = Read-Host "运行间隔单位 (m/h/d, 默认 h)"
    $value = Read-Host "数值 (默认 6)"
    if ([string]::IsNullOrWhiteSpace($unit))  { $unit  = 'h' }
    if ([string]::IsNullOrWhiteSpace($value)) { $value = 6    }
    $interval = switch ($unit) {
        'm' { New-TimeSpan -Minutes $value }
        'd' { New-TimeSpan -Days   $value }
        default { New-TimeSpan -Hours  $value }
    }
    @{
        checkUpdate = ($checkUpdate -ne 'n')
        syncCode    = ($syncCode    -ne 'n')
        proxyMode   = $proxyMode
        proxy       = $proxy
        interval    = $interval.ToString()
    } | ConvertTo-Json | Out-File $confFile -Encoding UTF8
}

$conf = Get-Content $confFile | ConvertFrom-Json
$intervalSpan = [timespan]$conf.interval

# 构造命令
$cmdPrefix = "& { `$env:PM2_HOME='C:\$env:USERNAME\.pm2'; Set-Location '$projectPath'; .\.venv\Scripts\Activate.ps1; "

$proxyCmd = switch ($conf.proxyMode) {
    'manual' { "[Environment]::SetEnvironmentVariable('HTTP_PROXY','$($conf.proxy)','Process'); [Environment]::SetEnvironmentVariable('HTTPS_PROXY','$($conf.proxy)','Process'); " }
    'auto'   { "if (`$env:HTTP_PROXY) { git config --global http.proxy `$env:HTTP_PROXY } else { git config --global --unset http.proxy } " }
    default  { "git config --global --unset http.proxy" }
}

$updateActions = @()
if ($conf.checkUpdate) {
    $updateActions += "git fetch origin"
    if ($conf.syncCode) {
        $updateActions += @"
`$local  = git rev-parse HEAD
`$remote = git rev-parse '@{{u}}'
if (`$local -ne `$remote) {
    git reset --hard origin/main
    yarn install --registry https://registry.npmmirror.com/
    pip install -r spider\py\base\requirements.txt -i https://mirrors.cloud.tencent.com/pypi/simple
    pm2 restart drpyS
}
"@
    }
}
$fullCmd = $cmdPrefix + $proxyCmd + ($updateActions -join '; ') + " }"

# 开机自启
$startupTask = "drpyS_PM2_Startup"
Get-ScheduledTask -TaskName $startupTask -ErrorAction SilentlyContinue | Unregister-ScheduledTask -Confirm:$false
$actionStart = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -Command `"$($cmdPrefix) pm2 start index.js --name drpyS --update-env }`"" `
    -WorkingDirectory $projectPath
$triggerStart = New-ScheduledTaskTrigger -AtStartup -RandomDelay (New-TimeSpan -Seconds 30)
Register-ScheduledTask -TaskName $startupTask -Action $actionStart -Trigger $triggerStart `
    -Settings (New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries) `
    -User "SYSTEM" -RunLevel Highest -Force | Out-Null
Write-Host "已创建/更新开机自启任务：$startupTask" -ForegroundColor Green

# 定时更新
$updateTask = "drpyS_Update"
Get-ScheduledTask -TaskName $updateTask -ErrorAction SilentlyContinue | Unregister-ScheduledTask -Confirm:$false
$actionUpdate = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -WindowStyle Hidden -Command `"$fullCmd`"" `
    -WorkingDirectory $projectPath
$triggerUpdate = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval $intervalSpan
Register-ScheduledTask -TaskName $updateTask -Action $actionUpdate -Trigger $triggerUpdate `
    -Settings (New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable) `
    -User "SYSTEM" -RunLevel Highest -Force | Out-Null
Write-Host "已创建/更新定时更新任务：$updateTask（间隔 $($intervalSpan.ToString('g'))）" -ForegroundColor Green

# ------------------------------------------------------------------
# 11. 结束提示 & 清理
# ------------------------------------------------------------------
deactivate *>$null
Set-Location -LiteralPath $PSScriptRoot
$ip = (ipconfig | Select-String "IPv4 地址" | Select-Object -First 1).ToString().Split(":")[-1].Trim()
$public = (Invoke-RestMethod "https://ipinfo.io/ip")
Write-Host "内网地址：http://${ip}:5757" -ForegroundColor Green
Write-Host "公网地址：http://${public}:5757" -ForegroundColor Green
Write-Host "脚本执行完成！重启后 drpyS 自动启动并按设定间隔检查更新。" -ForegroundColor Green
Write-Host "按任意键退出!!!" -ForegroundColor Green
Read-Host
