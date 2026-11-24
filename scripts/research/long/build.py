import json,csv,collections,datetime,numpy as np,pickle
C='.cache/research/'
snaps=json.load(open(C+'fpecr-history.json'))
ids={};birth={};draft={};pfr2g={}
for x in csv.DictReader(open(C+'db_playerids.csv')):
    if x['fantasypros_id'] and x['gsis_id']: ids[x['fantasypros_id']]=x['gsis_id']
    g=x['gsis_id']
    if g:
        birth[g]=x['birthdate']; draft[g]=(x['draft_year'],x['draft_round'])
        if x['pfr_id']: pfr2g[x['pfr_id']]=g
for x in csv.DictReader(open(C+'players.csv')):
    g=x['gsis_id']
    if g and not birth.get(g): birth[g]=x['birth_date']
    if g and (not draft.get(g) or draft[g][1] in('','NA')): draft[g]=(x['draft_year'] or x['rookie_season'],x['draft_round'])
games=collections.defaultdict(dict); coach={}
for x in csv.DictReader(open(C+'games.csv')):
    s=int(x['season'])
    if x['game_type']!='REG': continue
    w=int(x['week']); d=x['gameday']
    if w not in games[s] or d<games[s][w]: games[s][w]=d
    coach[(s,x['home_team'])]=x['home_coach']; coach[(s,x['away_team'])]=x['away_coach']
# weekly stats
st=collections.defaultdict(dict)  # gsis -> {(s,w):row}
teamtgt=collections.Counter(); teamtouch=collections.Counter(); teampts=collections.Counter()
for s in range(2020,2027):
    for x in csv.DictReader(open(C+f'stats_{s}.csv')):
        if x['season_type']!='REG': continue
        w=int(x['week']); g=x['player_id']
        f=lambda k: float(x[k]) if x.get(k) not in (None,'','NA') else 0.
        r={'pts':f('fantasy_points_ppr'),'tgt':f('targets'),'car':f('carries'),'att':f('attempts'),'team':x['team'],'pos':x['position']}
        st[g][(s,w)]=r; teamtgt[(x['team'],s,w)]+=r['tgt']; teamtouch[(x['team'],s,w)]+=r['tgt']+r['car']; teampts[(x['team'],s)]+=r['pts']
xfp=collections.defaultdict(dict)
for s in range(2021,2027):
    for x in csv.DictReader(open(C+f'ep_{s}.csv')):
        try: xfp[x['player_id']][(s,int(x['week']))]=(float(x['total_fantasy_points_exp'] or 0),float(x['total_fantasy_points'] or 0))
        except: pass
snap=collections.defaultdict(dict)
for s in range(2021,2027):
    for x in csv.DictReader(open(C+f'snaps_{s}.csv')):
        g=pfr2g.get(x['pfr_player_id'])
        if g and x['game_type']=='REG': snap[g][(s,int(x['week']))]=float(x['offense_pct'] or 0)
inj={}
for s in range(2021,2027):
    for x in csv.DictReader(open(C+f'injuries_{s}.csv')):
        if x['game_type']=='REG': inj[(x['gsis_id'],s,int(x['week']))]=x['report_status']
pickle.dump(dict(snaps=snaps,ids=ids,birth=birth,draft=draft,games=dict(games),coach=coach,st=dict(st),teamtgt=teamtgt,teamtouch=teamtouch,teampts=teampts,xfp=dict(xfp),snap=dict(snap),inj=inj),open('.cache/research/raw.pkl','wb'))
print('ok',len(ids),len(st))
