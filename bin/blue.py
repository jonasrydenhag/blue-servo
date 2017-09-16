#!/usr/bin/python3

import time
import subprocess
import sys

rfcomm = "rfcomm1"
bdAddr = "00:06:66:7A:D1:05"
channel = 1

proc = None

connectProblemNr = 0
keepAlive = 1

def connect():
	global proc
	global connectProblemNr
	global keepAlive

	if (connectProblemNr > 10):
		print("too many problems")
		keepAlive = 0
		return

	cmd = "rfcomm connect /dev/%s %s %s" % (rfcomm, bdAddr, channel)

	proc = subprocess.Popen(
		cmd,
		shell=True,
		stdout=subprocess.PIPE,
		stderr=subprocess.PIPE
	)

	outs, errs = proc.communicate()

	if (errs == b"Can't connect RFCOMM socket: Host is down\n" or
			errs == b"Can't connect RFCOMM socket: Device or resource busy\n" or
			errs == b"Can't connect RFCOMM socket: No route to host\n"):
		connectProblemNr += 1
		print("we have a problem")
		time.sleep(2)
		connect()
	else:
		connectProblemNr = 0

try:
	connect()

	while keepAlive:
		time.sleep(1)
		if (proc.poll() == 0):
			print("gone. reconnect.")
			connect()

except KeyboardInterrupt:
	print("Quit")
except:
	print("Unexpected error:", sys.exc_info()[0])
finally:
	if (proc.poll() != 0):
		proc.kill()

print("done")
