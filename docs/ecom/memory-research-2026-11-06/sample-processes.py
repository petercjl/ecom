#!/usr/bin/env python3
"""Read-only macOS process sampling; exclusive outputs, no browser debugging."""
import ctypes
import datetime
import json
import pathlib
import re
import subprocess
import time

class Usage(ctypes.Structure):
    _fields_ = [('uuid', ctypes.c_ubyte * 16)] + [(k, ctypes.c_uint64) for k in
        ['user_ns', 'system_ns', 'wakeups', 'interrupts', 'pageins', 'wired',
         'resident', 'footprint', 'start', 'exit']]

lib = ctypes.CDLL('/usr/lib/libproc.dylib', use_errno=True)
out = pathlib.Path(__file__).parent / 'measurements.json'
if out.exists():
    raise SystemExit('Output already exists; choose a new output location.')

def sample():
    rows = {}
    for line in subprocess.check_output(['ps', '-axo', 'pid=,ppid=,etime=,command='], text=True).splitlines():
        parts = line.strip().split(None, 3)
        if len(parts) == 4:
            pid, ppid, age, command = parts
            days, _, clock = age.rpartition('-')
            values = [int(x) for x in clock.split(':')]
            seconds = sum(v * 60**i for i, v in enumerate(reversed(values))) + int(days or 0) * 86400
            rows[int(pid)] = (int(ppid), seconds, command)
    roots = {}
    for pid, (ppid, age, command) in rows.items():
        for name in ['Ecom Dev', 'Google Chrome', 'Brave Browser']:
            marker = '.app/Contents/MacOS/' + name
            if re.search(re.escape(marker) + r'(?:$| --)', command):
                role = ('seller' if '--remote-debugging-port=9223' in command else
                        'buyer' if '--remote-debugging-port=9224' in command else
                        'dev' if name == 'Ecom Dev' else 'ordinary-or-other')
                roots[pid] = dict(browser=name, role=role, age_s=age,
                    debugging=bool(re.search(r'--remote-debugging-(port|pipe)', command)))
    processes = []
    for pid, (ppid, age, command) in rows.items():
        ancestor, seen = pid, set()
        while ancestor in rows and ancestor not in roots and ancestor not in seen:
            seen.add(ancestor)
            ancestor = rows[ancestor][0]
        if ancestor not in roots:
            continue
        kind = re.search(r'--type=([^ ]+)', command)
        kind = kind.group(1) if kind else ('browser' if pid in roots else 'other')
        subtype = re.search(r'--utility-sub-type=([^ ]+)', command)
        usage = Usage()
        rc = lib.proc_pid_rusage(pid, 0, ctypes.byref(usage))
        processes.append(dict(pid=pid, ppid=ppid, root_pid=ancestor, kind=kind,
            subtype=subtype.group(1) if subtype else None, age_s=age, rusage_rc=rc,
            errno=ctypes.get_errno() if rc else 0,
            **({k: getattr(usage, k) for k in ['resident','footprint','user_ns','system_ns','pageins','start']} if rc == 0 else {})))
    return dict(time=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat(),
        roots=roots, processes=processes,
        vm_stat=subprocess.check_output(['vm_stat'], text=True),
        swap=subprocess.check_output(['sysctl','vm.swapusage'], text=True))

samples = []
for i in range(5):
    if i:
        time.sleep(15)
    s = sample()
    samples.append(s)
    summary = []
    for root, meta in s['roots'].items():
        p = [x for x in s['processes'] if x['root_pid'] == root]
        summary.append(dict(root=root, **meta, processes=len(p),
            renderers=sum(x['kind']=='renderer' for x in p),
            footprint_mib=round(sum(x.get('footprint',0) for x in p)/2**20,1),
            resident_mib=round(sum(x.get('resident',0) for x in p)/2**20,1)))
    print(json.dumps(dict(sample=i,time=s['time'],summary=summary)), flush=True)
with out.open('x') as f:
    json.dump(dict(method='proc_pid_rusage RUSAGE_INFO_V0; ancestry grouping; no argv/URLs persisted; detached crashpad handlers excluded', samples=samples), f, indent=2)
