import subprocess,csv,io,json
G=['git','-C',__import__('os').environ['DP_GIT']]
log=subprocess.check_output(G+['log','--format=%H %cI','origin/master','--','files/db_fpecr_latest.csv']).decode().split('\n')
snaps=[]
for line in log:
    if not line.strip(): continue
    sha,dt=line.split()
    body=subprocess.check_output(G+['show',f'{sha}:files/db_fpecr_latest.csv']).decode('utf8','replace')
    rows=[]; sd=None
    for x in csv.DictReader(io.StringIO(body)):
        if x['ecr_type'] in('rp','dp') and x['pos'] in('QB','RB','WR','TE'):
            try: rows.append([x['ecr_type'],x['id'],x['pos'],float(x['ecr']),float(x['sd'] or 0)]); sd=x['scrape_date']
            except: pass
    snaps.append({'sha':sha,'commit':dt[:10],'scrape':sd,'rows':rows})
json.dump(snaps,open('.cache/research/fpecr-history.json','w'))
print(len(snaps)); import collections
print(sorted(collections.Counter(s['scrape'][:7] for s in snaps if s['scrape']).items()))
