import pickle,numpy as np,collections,datetime,json
D=pickle.load(open('.cache/research/raw.pkl','rb'));st=D['st']
TOP={'QB':36,'RB':60,'WR':84,'TE':36}; CLIFF={'RB':27,'WR':30,'TE':30,'QB':34}
def season_feats(g,s,pos):
    log=[(k[1],v) for k,v in st.get(g,{}).items() if k[0]==s and (v['tgt']+v['car']+v['att']>0 or v['pts']!=0)]
    if len(log)<4: return None
    pts=[v['pts'] for _,v in log]
    if pos in('WR','TE'): share=np.mean([v['tgt']/max(1,D['teamtgt'][(v['team'],s,w)]) for w,v in log])
    elif pos=='RB': share=np.mean([(v['car']+v['tgt'])/max(1,D['teamtouch'][(v['team'],s,w)]) for w,v in log])
    else: share=np.mean([v['att']+v['car'] for _,v in log])/45
    xs=[D['xfp'].get(g,{}).get((s,w)) for w,_ in log]; xs=[x for x in xs if x]
    sn=[D['snap'].get(g,{}).get((s,w)) for w,_ in log]; sn=[x for x in sn if x is not None]
    return dict(ppg=np.mean(pts),games=len(log),share=share,xfp=np.mean([x[0] for x in xs]) if xs else None,
                luck=(sum(x[1] for x in xs)-sum(x[0] for x in xs))/max(1,sum(x[0] for x in xs)) if xs else None,snap=np.mean(sn) if sn else None,team=collections.Counter(v['team'] for _,v in log).most_common(1)[0][0])
# team offense rank by season
trank={}
for s in range(2020,2027):
    t=sorted({k[0] for k in D['teampts'] if k[1]==s},key=lambda x:-D['teampts'][(x,s)])
    for i,x in enumerate(t): trank[(x,s)]=i+1
rows=[]
for s in range(2021,2027):
    cands=[sn for sn in D['snaps'] if sn['scrape'] and sn['scrape'][:7] in (f'{s}-08',f'{s}-09') and sn['scrape']<=D['games'][s][1]]
    if not cands: continue
    sn=max(cands,key=lambda x:x['scrape']); d=sn['scrape']
    for pos in TOP:
        rk=sorted([r for r in sn['rows'] if r[0]=='dp' and r[2]==pos],key=lambda r:r[3])[:TOP[pos]]
        cand=[]
        for i,r in enumerate(rk):
            g=D['ids'].get(r[1])
            if not g: continue
            # outcome: points over this season and next (2026 partial -> scaled to 17 games)
            def tot(y):
                v=[x['pts'] for k,x in st.get(g,{}).items() if k[0]==y and k[1]<=17]
                return sum(v)
            nxt=s+1
            maxw=max(w for (ss,w) in [k for gg in list(st.values())[:50] for k in gg] if ss==2026) if nxt==2026 or s==2026 else 17
            act1=tot(s); act2=tot(nxt) if nxt<=2026 else None
            if s==2026: act1=act1*17/max(1,maxw-0)
            if nxt==2026 and act2 is not None: act2=act2*17/max(1,maxw)
            b=D['birth'].get(g); age=(datetime.date.fromisoformat(d)-datetime.date.fromisoformat(b)).days/365.25 if b and b not in('NA','') else None
            dy,drd=D['draft'].get(g,('',''))
            try: dy=int(float(dy))
            except: dy=None
            try: drd=int(float(drd))
            except: drd=None
            f=season_feats(g,s-1,pos)
            cand.append(dict(season=s,pos=pos,g=g,rank=i+1,ecr=r[3],sd=r[4],a1=act1,a2=act2,age=age,dy=dy,drd=drd,f=f))
        for c in cand:
            pe=[x for x in cand if x is not c and abs(x['rank']-c['rank'])<=3 and x['f']]
            F={}; f=c['f']
            if c['age']: F['age']=np.clip((CLIFF[pos]-c['age']-2)/4,-1,1)
            yrs=(s-c['dy']) if c['dy'] else None
            dc={1:1,2:0.6,3:0.2,4:-0.2,5:-0.2}.get(c['drd'],-0.5)
            F['draft']=dc*(0.4 if yrs and yrs>=4 else 1)
            F['rookie']=1. if yrs==0 else 0.
            if f and pe:
                pp=[x['f']['ppg'] for x in pe]; F['ppg']=np.clip((f['ppg']/max(0.1,np.median(pp))-1)/0.35,-1,1)
                px=[x['f']['xfp'] for x in pe if x['f']['xfp']]
                if f['xfp'] and px: F['xfp']=np.clip((f['xfp']/np.median(px)-1)/0.3,-1,1)
                if f['luck'] is not None: F['luck']=np.clip(-f['luck']/0.35,-1,1)
                ps=[x['f']['share'] for x in pe]; F['share']=np.clip((f['share']/max(1e-6,np.median(ps))-1)/0.3,-1,1)
                if f['snap'] is not None and pos!='QB': F['snap']=np.clip((f['snap']-0.6)/0.3,-1,1)
                F['games']=(f['games']-12)/5
                tr=trank.get((f['team'],s-1)); 
                if tr: F['team']=(16.5-tr)/16*0.7
            F['sd']=-(c['sd']/max(1,c['ecr']))
            c['F']=F
        for c in cand: c.pop('f'); rows.append(c)
json.dump(rows,open('.cache/research/dyn.json','w'),default=float)
print(len(rows),collections.Counter(r['season'] for r in rows))
