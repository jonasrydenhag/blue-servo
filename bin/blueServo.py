#!/usr/bin/python

import subprocess
import time

rfcomm = "rfcomm1"
pushCmd = "push"

connectProblemNr = 0

def push():
	global connectProblemNr

	cmd = "echo '%s' > /dev/%s" % (pushCmd, rfcomm)
	proc = subprocess.Popen(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

	outs, errs = proc.communicate()
	errorMsg = '/bin/sh: 1: cannot create /dev/%s: No such device or address\n' % rfcomm

	if (errs == errorMsg and connectProblemNr < 5):
		connectProblemNr += 1
		subprocess.call("python3 /home/pi/bin/blue.py &", shell=True)
		time.sleep(5)
		push()

push()
