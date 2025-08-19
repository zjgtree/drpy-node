#!/bin/bash
# 根据 PID 杀死子进程
pkill -P $(pgrep -f 't4_daemon.py')