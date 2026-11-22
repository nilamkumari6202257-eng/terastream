#!/usr/bin/env python3
"""Double-fork daemonize: run a command fully detached (reparented to init)."""
import os, sys, subprocess, time

def daemonize_and_run(argv):
    # first fork
    pid = os.fork()
    if pid > 0:
        time.sleep(0.3)
        return 0
    # child: new session, detach
    os.setsid()
    # second fork so the final process can never reacquire a controlling tty
    pid = os.fork()
    if pid > 0:
        os._exit(0)
    # redirect stdio
    devnull = os.open(os.devnull, os.O_RDWR)
    for fd in (0, 1, 2):
        os.dup2(devnull, fd)
    os.close(devnull)
    # execute
    os.execvp(argv[0], argv)

if __name__ == "__main__":
    cmd = sys.argv[1:]
    if not cmd:
        print("usage: daemonize.py CMD [ARGS...]")
        sys.exit(2)
    rc = daemonize_and_run(cmd)
    sys.exit(rc)
