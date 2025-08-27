<#
.SYNOPSIS
    drpys 一键卸载脚本（最终容错版）
.DESCRIPTION
    1) 删除任务计划
    2) 停止并删除 PM2 进程
    3) 结束残余 Node 进程
    4) 删除源码目录
    5) 可选：卸载运行环境（Node、Python、nvm、Git、yarn、pm2）
.PARAMETER SkipConfirm
    静默模式
.PARAMETER IncludeEnv
    强制连环境一起删
.PARAMETER UseProxy
    下载时使用代理
.PARAMETER ProxyHost
    代理地址，默认 127.0.0.1:7890
#>

param(
    [switch]$SkipConfirm,
    [switch]$IncludeEnv,
    [switch]$UseProxy,
    [string]$ProxyHost = "127.0.0.1:7890"
)
$ErrorActionPreference = "Stop"

# ---------- 1. 自动提权 ----------
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "当前非管理员权限，正在尝试以管理员身份重新启动..." -ForegroundColor Yellow
    $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$($MyInvocation.MyCommand.Path)`""
    if ($SkipConfirm) { $arguments += " -SkipConfirm" }
    if ($IncludeEnv)  { $arguments += " -IncludeEnv" }
    if ($UseProxy)    { $arguments += " -UseProxy -ProxyHost `"$ProxyHost`"" }
    Start-Process powershell -ArgumentList $arguments -Verb RunAs
    exit
}
Set-Location -LiteralPath $PSScriptRoot

# ---------- 2. 代理 & 工具 ----------
function Use-ProxyIfNeeded ([scriptblock]$Script) {
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
function Test-Cmd ([string]$cmd) { $null -ne (Get-Command $cmd -ErrorAction SilentlyContinue) }

# ---------- 3. 交互确认 ----------
if (-not $SkipConfirm) {
    Write-Host "========== drpys 卸载脚本 ==========" -ForegroundColor Cyan
    Write-Host "请选择卸载方式：" -ForegroundColor Yellow
    Write-Host "  1) 仅删除项目（保留环境）"
    Write-Host "  2) 删除项目 + 卸载运行环境"
    $choice = Read-Host "请输入对应数字（1/2）默认(1)"
    $IncludeEnv = ($choice -eq "2")
}

# ---------- 4. 任务计划 ----------
"drpyS_PM2_Startup","drpyS_Update" | ForEach-Object {
    if (Get-ScheduledTask -TaskName $_ -ErrorAction SilentlyContinue) {
        Write-Host "删除任务计划 $_ ..." -ForegroundColor Green
        Unregister-ScheduledTask -TaskName $_ -Confirm:$false
    }
}

# ---------- 5. PM2 进程 ----------
if (Test-Cmd "pm2") {
    Write-Host "停止并删除 PM2 进程 drpyS ..." -ForegroundColor Green
    pm2 stop drpyS   *>$null
    pm2 delete drpyS *>$null
    pm2 save         *>$null
}

# ---------- 6. 结束残余 Node ----------
Get-Process -Name "node" -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host "结束残余 Node 进程 PID $($_.Id) ..." -ForegroundColor Green
    Stop-Process -Id $_.Id -Force
}

# ---------- 7. 删除源码 ----------
$repoDir = Read-Host "请输入项目存放目录（留空则使用当前目录）"
if ([string]::IsNullOrWhiteSpace($repoDir)) { $repoDir = (Get-Location).Path }
$projectPath = Join-Path $repoDir "drpy-node"
if (Test-Path $projectPath) {
    Write-Host "删除源码目录 $projectPath ..." -ForegroundColor Green
    Remove-Item -Recurse -Force $projectPath
} else {
    Write-Host "未检测到源码目录，跳过删除" -ForegroundColor Yellow
}

# ---------- 8. 卸载运行环境（与安装脚本一一对应） ----------
if ($IncludeEnv) {
    Write-Host "开始卸载运行环境（与安装脚本对应）..." -ForegroundColor Yellow

    # 1) Node 20.18.3 用 nvm 卸载
    if (Test-Cmd "nvm") {
        Write-Host "使用 nvm 卸载 Node 20.18.3 ..." -ForegroundColor Green
        nvm uninstall 20.18.3 2>$null
        # 如果这是最后一个版本，nvm 本身仍保留，用户可手动在「应用和功能」里再卸 nvm
    } else {
        Write-Host "未检测到 nvm，跳过 Node 版本卸载" -ForegroundColor Yellow
    }

    # 2) Python 3.11 —— 安装脚本里直接解压到 C:\Python311 并写注册表/追加 PATH
    $pyDir = "C:\Python311"
    if (Test-Path $pyDir) {
        Write-Host "删除 Python 3.11 目录 $pyDir ..." -ForegroundColor Green
        Remove-Item -Recurse -Force $pyDir -ErrorAction SilentlyContinue
    }

    # 3) Git —— 安装脚本用 winget 装的，直接用 winget 卸载
    try {
        Write-Host "winget 卸载 Git..." -ForegroundColor Green
        winget uninstall --id Git.Git -e --accept-source-agreements --silent
    } catch {
        Write-Warning "Git winget 卸载失败，请手动在「应用和功能」里卸载"
    }

    # 4) yarn / pm2 —— 安装脚本 npm -g 装的，npm -g 卸载
    if (Test-Cmd "npm") {
        Write-Host "npm 全局卸载 yarn、pm2 ..." -ForegroundColor Green
        npm uninstall -g yarn pm2 *>$null
    }

    Write-Host "运行环境卸载步骤结束，如有残留请手动到「应用和功能」确认。" -ForegroundColor Yellow
}

# ---------- 9. 完成 ----------
Write-Host "drpys 卸载完成！" -ForegroundColor Green
Write-Host "按任意键退出！！！" -ForegroundColor Green
Read-Host
