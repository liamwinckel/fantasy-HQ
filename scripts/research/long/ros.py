import pickle,numpy as np,collections,itertools,datetime,json,sys
from sklearn.linear_model import LogisticRegression
D=pickle.load(open('.cache/research/raw.pkl','rb'));st=D['st'];games=D['games']
TOP={'QB':30,'RB':60,'WR':72,'TE':30}; CLIFF={'RB':27,'WR':30,'TE':30,'QB':34}
def wk_of(s,date):
    for w in sorted(games.get(s,{})):
        if games[s][w]>=date: return w
def med(a): return float(np.median(a)) if len(a) else None
def player_feats(g,s,w,pos):
    log=[(k[1],v) for k,v in st.get(g,{}).items() if k[0]==s and k[1]<w and (v['pts']!=0 or v['tgt']+v['car']+v['att']>0)]
    log.sort()
    if not log: return None
    pts=[v['pts'] for _,v in log]
    last=log[-4:]
    if pos in('WR','TE'): share=np.mean([v['tgt']/max(1,D['teamtgt'][(v['team'],s,ww)]) for ww,v in last])
    elif pos=='RB': share=np.mean([(v['car']+v['tgt'])/max(1,D['teamtouch'][(v['team'],s,ww)]) for ww,v in last])
    else: share=np.mean([v['att']+v['car'] for _,v in last])/45
    xs=[D['xfp'].get(g,{}).get((s,ww)) for ww,_ in log]; xs=[x for x in xs if x]
    sn=[D['snap'].get(g,{}).get((s,ww)) for ww,_ in log[-3:]]; sn=[x for x in sn if x is not None]
    return dict(ppg=np.mean(pts),ppg4=np.mean(pts[-4:]),games=len(log),share=share,
        xfp4=np.mean([x[0] for x in xs[-4:]]) if xs else None, luck=(sum(x[1] for x in xs)-sum(x[0] for x in xs))/max(1,sum(x[0] for x in xs)) if xs else None,
        snap=np.mean(sn) if sn else None, missed=(w-1-len(log))/max(1,w-1), team=log[-1][1]['team'])
rows=[]
seen=set()
for sn in sorted(D['snaps'],key=lambda x:x['scrape'] or ''):
    if not sn['scrape']: continue
    d=sn['scrape']; s=int(d[:4]) if d[5:7]>='09' else None
    if s is None or s<2021: continue
    w=wk_of(s,d)
    if not w or w<4 or w>14 or (s,w) in seen: continue
    seen.add((s,w))
    for pos in TOP:
        rk=sorted([r for r in sn['rows'] if r[0]=='rp' and r[2]==pos],key=lambda r:r[3])[:TOP[pos]]
        cand=[]
        for i,r in enumerate(rk):
            g=D['ids'].get(r[1]); 
            if not g: continue
            fut=sum(v['pts'] for k,v in st.get(g,{}).items() if k[0]==s and w<=k[1]<=17)
            f=player_feats(g,s,w,pos)
            b=D['birth'].get(g); age=(datetime.date.fromisoformat(d)-datetime.date.fromisoformat(b)).days/365.25 if b and b not in('NA','') else None
            cand.append(dict(season=s,week=w,pos=pos,g=g,rank=i+1,ecr=r[3],sd=r[4],actual=fut,f=f,age=age,inj=D['inj'].get((g,s,w))))
        # app-like peer factors
        for c in cand:
            pe=[x for x in cand if x is not c and abs(x['rank']-c['rank'])<=3 and x['f'] and x['f']['games']>=2]
            f=c['f']; F={}
            if f and f['games']>=2 and pe:
                ref=med([x['f']['ppg'] for x in pe]); F['ppg']=np.clip((f['ppg']/ref-1)/0.35,-1,1) if ref>0 else 0
                ref=med([x['f']['ppg4'] for x in pe]); F['form']=np.clip((f['ppg4']/ref-1)/0.35,-1,1) if ref>0 else 0
                ps=[x['f']['snap'] for x in pe if x['f']['snap'] is not None]
                if f['snap'] is not None and ps and pos!='QB': F['snap']=np.clip((f['snap']-med(ps))/0.2,-1,1)
                px=[x['f']['xfp4'] for x in pe if x['f']['xfp4']]
                if f['xfp4'] and px:
                    F['xfp']=np.clip((f['xfp4']/med(px)-1)/0.3,-1,1)
                if f['luck'] is not None: F['luck']=np.clip(-f['luck']/0.35,-1,1)
                psh=[x['f']['share'] for x in pe]
                F['share']=np.clip((f['share']/max(1e-6,med(psh))-1)/0.3,-1,1)
                F['missed']=-f['missed']
            if c['age'] and pos in CLIFF: F['age']=np.clip((CLIFF[pos]-c['age']-2)/4,-1,1)
            i_=c['inj']; F['inj']={'Out':-0.35,'Doubtful':-0.2,'Questionable':-0.05}.get(i_,0.05)
            F['sd']=-(c['sd']/max(1,c['ecr']))  # expert disagreement
            c['F']=F
        for c in cand: c.pop('f'); rows.append(c)
json.dump(rows,open('.cache/research/ros.json','w'),default=float)
print(len(rows),len(seen),sorted(seen))
