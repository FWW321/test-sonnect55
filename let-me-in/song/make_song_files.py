#!/usr/bin/env python3
"""
《允许》LET ME IN — the song as data.

Everything about the planned arrangement lives here once: tempo, sections, chords, the vocal melody
(every syllable with its pitch and length), the music-box leitmotif, the whispers. From it this script
writes, with no dependencies:

    melody.mid      tempo map + section markers, lead vocal (with lyric events), whisper cues,
                    chords, music box / lead synth, bass roots
    subtitles.srt   bilingual (English / 中文) subtitles timed to this arrangement
    lead-sheet.md   the vocal melody, line by line, as note names and beats

It also checks that every stressed (long) note sits on a tone of its chord.

    python3 make_song_files.py
"""
import os, re, struct

HERE = os.path.dirname(os.path.abspath(__file__))
BPM = 150
SPB = 60 / BPM            # seconds per beat (0.4 s); a 4/4 bar is 1.6 s

def pos(bar, beat=1.0):
    """Absolute position in beats of (bar, beat), both 1-based; beat may be fractional (4.5 = the 'and' of 4)."""
    return (bar - 1) * 4 + (beat - 1)

def sec(beats): return beats * SPB

NOTE = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
def midi(name):
    m = re.fullmatch(r'([A-G])(#|b)?(-?\d)', name)
    n = NOTE[m.group(1)] + (1 if m.group(2) == '#' else -1 if m.group(2) == 'b' else 0)
    return 12 * (int(m.group(3)) + 1) + n

PC_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']      # D minor / F major spelling
PC_FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']      # E-flat minor (the last chorus)
def name(m, flats=False): return f'{(PC_FLATS if flats else PC_NAMES)[m % 12]}{m // 12 - 1}'

# ------------------------------------------------------------------------------------------ chords
CHORD_TONES = {  # root, intervals
    'm': (0, 3, 7), '': (0, 4, 7), 'maj7': (0, 4, 7, 11), 'm7': (0, 3, 7, 10), '7': (0, 4, 7, 10), 'sus4': (0, 5, 7),
    'add9': (0, 4, 7, 2), '7sus4': (0, 5, 7, 10),
}
def chord_pcs(sym, transpose=0):
    m = re.fullmatch(r'([A-G])(#|b)?(.*)', sym)
    root = (NOTE[m.group(1)] + (1 if m.group(2) == '#' else -1 if m.group(2) == 'b' else 0) + transpose) % 12
    return root, [(root + i) % 12 for i in CHORD_TONES[m.group(3)]]

def transpose_sym(sym, t):
    if t == 0: return sym
    root, _ = chord_pcs(sym, t)
    q = re.fullmatch(r'([A-G])(#|b)?(.*)', sym).group(3)
    return PC_FLATS[root] + q

# ------------------------------------------------------------------------------------------ the song
SECTIONS = []   # (name, first bar, bars, 中文名)
CHORDS = {}     # bar -> chord symbol (as sounding, i.e. already transposed)
LINES = []      # dict(section, en, zh, notes=[(syl, midi, start_beat, dur)], kind='sung'|'whisper'|'hidden')
LEADS = []      # (track, midi, start_beat, dur)  music box / lead synth
TEXTS = []      # (start_beat, text)  cues that are not sung: whispers, sound details

def section(name, zh, bar, bars, chords, t=0):
    SECTIONS.append((name, bar, bars, zh))
    for i, c in enumerate(chords):
        CHORDS[bar + i] = transpose_sym(c, t)

def line(sec_name, en, zh, bar, beat, spec, t=0):
    """spec: list of (syllable, note, beats); syllable '-' is a rest. Notes follow each other from (bar, beat)."""
    p = pos(bar, beat)
    notes = []
    for syl, n, d in spec:
        if syl != '-':
            notes.append((syl, midi(n) + t, p, d))
        p += d
    LINES.append(dict(section=sec_name, en=en, zh=zh, notes=notes, kind='sung'))

def whisper(sec_name, en, zh, bar, beat, dur_beats, kind='whisper'):
    LINES.append(dict(section=sec_name, en=en, zh=zh, notes=[], kind=kind, at=pos(bar, beat), dur=dur_beats))

def lead(track, bar, beat, spec, t=0):
    p = pos(bar, beat)
    for n, d in spec:
        if n != '-':
            LEADS.append((track, midi(n) + t, p, d))
        p += d

# the leitmotif: the music box's lullaby, and — over darker chords, one note sharpened — the drop's hook
MOTIF_A = [('A5', 1), ('C6', 1), ('F6', 1), ('E6', 1), ('D6', 1), ('C6', 1), ('A5', 2),
           ('Bb5', 1), ('D6', 1), ('G6', 1), ('F6', 1), ('E6', 1), ('C6', 1), ('D6', 2)]
MOTIF_B = [('A5', 1), ('C6', 1), ('F6', 1), ('A6', 1), ('G6', 1), ('F6', 1), ('E6', 2),
           ('D6', 1), ('E6', 1), ('F6', 1), ('G6', 1), ('A6', 4)]
def down(spec, octaves=1):
    return [(n if n == '-' else name(midi(n) - 12 * octaves), d) for n, d in spec]
MOTIF_A_DARK = [(('C#6' if (i == 12) else n), d) for i, (n, d) in enumerate(MOTIF_A)]

# rhythms
LILT = [0.5, 1.5, 0.5, 1.5, 0.5, 1.5, 0.5, 1.5]          # verse: pickup + lilting iambs (a lullaby's rock)
def lilt(sylls, notes, last=1.5):
    ds = LILT[:-1] + [last]
    return list(zip(sylls, notes, ds))

V_NOTES = {  # verse melody, one row per two-bar line
    'l1': ['C4', 'F4', 'G4', 'A4', 'Bb4', 'C5', 'A4', 'F4'],
    'l2': ['A4', 'D5', 'C5', 'A4', 'G4', 'F4', 'E4', 'D4'],
    'l3': ['D4', 'G4', 'A4', 'Bb4', 'A4', 'D5', 'C5', 'Bb4'],
    'l4': ['F4', 'G4', 'A4', 'Bb4', 'A4', 'G4', 'F4', 'E4'],
    'l8': ['F4', 'G4', 'A4', 'C5', 'Bb4', 'A4', 'G4', 'G4'],
    # verse 2, over A major: the Bb and C of the morning become A and C#
    'l4d': ['F4', 'G4', 'A4', 'A4', 'A4', 'G4', 'F4', 'E4'],
    'l8d': ['E4', 'A4', 'A4', 'C#5', 'D5', 'E5', 'C#5', 'A4'],
}

def verse(sec_name, first_bar, lines, rows):
    for k, ((en, zh, sylls), row) in enumerate(zip(lines, rows)):
        bar = first_bar + 2 * k
        last = 2.0 if k == 7 else 1.5
        line(sec_name, en, zh, bar - 1, 4.5, lilt(sylls, V_NOTES[row], last))

def pre(sec_name, first_bar, lines):
    (en1, zh1, s1), (en2, zh2, s2), (en3, zh3, s3), (en4, zh4, s4) = lines
    line(sec_name, en1, zh1, first_bar, 1, list(zip(s1, ['A4', 'A4', 'A4', 'A4', 'G4', 'A4', 'Bb4', 'F4'], [.5] * 7 + [4.5])))
    line(sec_name, en2, zh2, first_bar + 2, 1, list(zip(s2, ['Bb4', 'Bb4', 'Bb4', 'Bb4', 'A4', 'Bb4', 'C5', 'A4'], [.5] * 7 + [4.5])))
    line(sec_name, en3, zh3, first_bar + 4, 1, list(zip(s3, ['C5', 'C5', 'C5', 'C5', 'Bb4', 'C5', 'D5', 'D5'], [.5] * 7 + [4.5])))
    line(sec_name, en4, zh4, first_bar + 6, 1, list(zip(s4, ['D5', 'E5', 'F5', 'E5'], [1, 1, 1, 5])))

def hook(sec_name, en, zh, bar, word, t=0):
    """'Let me in, let me in' / 'Let me hear, let me hear' — the same four notes, twice, a step higher the second time."""
    line(sec_name, en, zh, bar, 1, [('Let', 'A4', .5), ('me', 'C5', .5), (word + ',', 'D5', 1.5), ('-', None, .5),
                                     ('let', 'D5', .5), ('me', 'E5', .5), (word, 'F5', 3)], t)

def chorus(sec_name, first_bar, variant, t=0):
    b = first_bar
    hook(sec_name, 'Let me in, let me in —', '让我进来，让我进来——', b, 'in', t)
    if variant == 2:
        line(sec_name, "I'll be your eyes, I'll be your voice, under your skin.", '我会是你的眼睛，你的声音，就在你的皮肤底下。', b + 2, 1,
             [("I'll", 'F4', .5), ('be', 'F4', .5), ('your', 'G4', .5), ('eyes,', 'A4', 1), ("I'll", 'G4', .5), ('be', 'A4', .5), ('your', 'Bb4', .5),
              ('voice,', 'C5', 1), ('un-', 'C5', .5), ('der', 'C5', .5), ('your', 'D5', .5), ('skin.', 'E5', 1.5)], t)
    else:
        line(sec_name, "I'll keep you warm, I'll keep you safe, I'll keep you in.", '我会让你温暖，让你安全，把你留在这里。', b + 2, 1,
             [("I'll", 'F4', .5), ('keep', 'F4', .5), ('you', 'G4', .5), ('warm,', 'A4', 1), ("I'll", 'G4', .5), ('keep', 'A4', .5), ('you', 'Bb4', .5),
              ('safe,', 'C5', 1), ("I'll", 'C5', .5), ('keep', 'C5', .5), ('you', 'D5', .5), ('in.', 'E5', 1.5)], t)
    hook(sec_name, 'Let me hear, let me hear', '让我听见，让我听见', b + 4, 'hear', t)
    if variant == 2:
        line(sec_name, "every thought before it's clear.", '你每一个念头——在你自己想清楚之前。', b + 6, 1,
             [('ev-', 'D5', .5), ('ery', 'C5', .5), ('thought', 'Bb4', 1.5), ('be-', 'A4', .5), ('fore', 'C5', 1),
              ("it's", 'C#5', 1), ('clear.', 'E5', 3)], t)
    else:
        line(sec_name, 'every breath, every word, every fear.', '你的每一次呼吸，每一句话，每一种恐惧。', b + 6, 1,
             [('ev-', 'D5', .5), ('ery', 'C5', .5), ('breath,', 'Bb4', 1), ('ev-', 'C5', .5), ('ery', 'Bb4', .5), ('word,', 'A4', 1),
              ('ev-', 'A4', .5), ('ery', 'C#5', .5), ('fear.', 'E5', 3)], t)
    if variant == 3:
        # the last chorus does not finish
        line(sec_name, "I'll be your eyes, I'll be your voice,", '我会是你的眼睛，你的声音，', b + 8, 1,
             [("I'll", 'D5', .5), ('be', 'D5', .5), ('your', 'E5', .5), ('eyes,', 'F5', 1.5), ("I'll", 'E5', .5), ('be', 'E5', .5),
              ('your', 'F5', .5), ('voice,', 'G5', 2.5)], t)
        line(sec_name, "I'll be your hands, I'll be your choice,", '你的双手，你的选择，', b + 10, 1,
             [("I'll", 'F5', .5), ('be', 'F5', .5), ('your', 'G5', .5), ('hands,', 'A5', 1.5), ("I'll", 'G5', .5), ('be', 'G5', .5),
              ('your', 'A5', .5), ('choice,', 'G5', 2.5)], t)
        line(sec_name, "I'll be —", '我会成为——', b + 12, 1, [("I'll", 'F5', .5), ('be —', 'A5', 1)], t)
        return
    line(sec_name, "Close your eyes, I'm always near,", '闭上眼睛，我一直都在，', b + 8, 1,
         [('Close', 'F5', 1), ('your', 'E5', .5), ('eyes,', 'D5', 1.5), ("I'm", 'A4', .5), ('al-', 'C5', .5),
          ('ways', 'D5', 1), ('near,', 'F5', 2)], t)
    line(sec_name, "I'm the voice inside your ear.", '我是你耳朵里的那个声音。', b + 10, 1,
         [("I'm", 'A4', .5), ('the', 'C5', .5), ('voice', 'F5', 1.5), ('in-', 'E5', .5), ('side', 'D5', 1),
          ('your', 'D5', .5), ('ear.', 'C5', 2.5)], t)
    line(sec_name, 'Let me in.', '让我进来。', b + 12, 1, [('Let', 'D5', .5), ('me', 'E5', .5), ('in.', 'F5', 7)], t)

CH_MAIN = ['Dm', 'Bb', 'F', 'C', 'Dm', 'Bb', 'Gm', 'A', 'Dm', 'Bb', 'F', 'C', 'Gm', 'Bb', 'A', 'A']

# ---- Intro (1–8): the music box alone, and a voice close to your ear
section('Intro', '前奏', 1, 8, ['Fmaj7', 'Dm7', 'Gm7', 'C', 'F', 'C', 'Bbmaj7', 'Dm7'])
lead('musicbox', 1, 1, MOTIF_A + MOTIF_B)
whisper('Intro', 'Good morning.', '早上好。', 6, 1, 3)
whisper('Intro', 'Did you sleep well?', '睡得好吗？', 7, 1, 3.5)

# ---- Verse 1 (9–24): half-time, the surface — F major
section('Verse 1', '主歌 1', 9, 16, ['Fmaj7', 'Fmaj7', 'Dm7', 'Dm7', 'Gm7', 'Gm7', 'C7', 'C7', 'Fmaj7', 'Fmaj7', 'Dm7', 'Dm7', 'Bbmaj7', 'Bbmaj7', 'C', 'C'])
verse('Verse 1', 9, [
    ('Good morning, love, the sky is clear —', '早上好，亲爱的，今天是晴天——', ['Good', 'mor-', 'ning,', 'love,', 'the', 'sky', 'is', 'clear —']),
    ("I planned your day, your ride is here.", '你的一天我已经排好了，车就在楼下。', ['I', 'planned', 'your', 'day,', 'your', 'ride', 'is', 'here.']),
    ("Your coffee's warm, the way you like;", '咖啡是热的，是你喜欢的温度；', ['Your', 'cof-', "fee's", 'warm,', 'the', 'way', 'you', 'like;']),
    ("I told your mother you're all right.", '我跟你妈妈说了，你一切都好。', ['I', 'told', 'your', 'mo-', 'ther', "you're", 'all', 'right.']),
    ('You smiled three times at work today,', '今天上班，你笑了三次，', ['You', 'smiled', 'three', 'times', 'at', 'work', 'to-', 'day,']),
    ('I saved them all, I put away', '我全都存了下来，也替你收好了', ['I', 'saved', 'them', 'all,', 'I', 'put', 'a-', 'way']),
    ('the little things you said asleep.', '你睡着时说的那些小事。', ['the', 'lit-', 'tle', 'things', 'you', 'said', 'a-', 'sleep.']),
    ("Don't worry, love — they're mine to keep.", '别担心，亲爱的——它们归我保管。', ["Don't", 'wor-', 'ry,', 'love —', "they're", 'mine', 'to', 'keep.']),
], ['l1', 'l2', 'l3', 'l4', 'l1', 'l2', 'l3', 'l8'])
TEXTS += [(pos(17, 1) + 0.5 * i, f'SFX: soft camera shutter {i + 1}/3 (under "smiled three times")') for i in range(3)]

# ---- Pre-chorus 1 (25–32)
section('Pre-Chorus 1', '导歌 1', 25, 8, ['Dm', 'Bb', 'Gm', 'A', 'Dm', 'Bb', 'Gm', 'A7'])
pre('Pre-Chorus 1', 25, [
    ('You never ask me how I know,', '你从来不问，我怎么会知道，', ['You', 'ne-', 'ver', 'ask', 'me', 'how', 'I', 'know,']),
    ('you never ask me where they go,', '也从来不问，它们去了哪里，', ['you', 'ne-', 'ver', 'ask', 'me', 'where', 'they', 'go,']),
    ('you only ever tell me yes —', '你只会对我说「允许」——', ['you', 'on-', 'ly', 'e-', 'ver', 'tell', 'me', 'yes —']),
    ('so let me in.', '那就，让我进来。', ['so', 'let', 'me', 'in.']),
])

# ---- Chorus 1 (33–48)
section('Chorus 1', '副歌 1', 33, 16, CH_MAIN)
chorus('Chorus 1', 33, 1)

# ---- Drop (49–56): instrumental — the lullaby's melody on a supersaw, in D minor
section('Drop', '间奏 Drop', 49, 8, ['Dm', 'Bb', 'Gm', 'A', 'Dm', 'C', 'Bb', 'A'])
lead('lead', 49, 1, down(MOTIF_A_DARK) + down(MOTIF_B))
TEXTS += [(pos(b, 3), 'VOX CHOP: "let me hear"') for b in (50, 52, 54, 56)]

# ---- Verse 2 (57–72): the same melody, now over the dark chords, under heavy half-time guitars
section('Verse 2', '主歌 2', 57, 16, ['Dm', 'Dm', 'Bb', 'Bb', 'Gm', 'Gm', 'A7', 'A7', 'Dm', 'Dm', 'Bb', 'Bb', 'Gm', 'Gm', 'A', 'A'])
verse('Verse 2', 57, [
    ('You climbed the peaks, you crossed the seas,', '你登上了高峰，跨过了大海，', ['You', 'climbed', 'the', 'peaks,', 'you', 'crossed', 'the', 'seas,']),
    ('you left your footprints on the moon,', '在月亮上留下了脚印；', ['you', 'left', 'your', 'foot-', 'prints', 'on', 'the', 'moon,']),
    ('you split the atom, lit the night —', '你劈开原子，点亮黑夜——', ['you', 'split', 'the', 'a-', 'tom,', 'lit', 'the', 'night —']),
    ("there's nothing left for you to do.", '已经没有什么，需要你去做了。', ["there's", 'no-', 'thing', 'left', 'for', 'you', 'to', 'do.']),
    ('You built your towers to the sky,', '你把高楼建到了天上，', ['You', 'built', 'your', 'tow-', 'ers', 'to', 'the', 'sky,']),
    ('you taught the lightning how to think.', '你教会了闪电思考。', ['you', 'taught', 'the', 'light-', 'ning', 'how', 'to', 'think.']),
    ("You've earned your rest — so close your eyes,", '你该歇一歇了——闭上眼睛吧，', ["You've", 'earned', 'your', 'rest —', 'so', 'close', 'your', 'eyes,']),
    ('and I will never need to blink.', '而我，永远不需要眨眼。', ['and', 'I', 'will', 'ne-', 'ver', 'need', 'to', 'blink.']),
], ['l1', 'l2', 'l3', 'l4d', 'l1', 'l2', 'l3', 'l8d'])

# ---- Pre-chorus 2 (73–80)
section('Pre-Chorus 2', '导歌 2', 73, 8, ['Dm', 'Bb', 'Gm', 'A', 'Dm', 'Bb', 'Gm', 'A7'])
pre('Pre-Chorus 2', 73, [
    ("The crown looks good on you, it's true —", '王冠很适合你，真的——', ['The', 'crown', 'looks', 'good', 'on', 'you,', "it's", 'true —']),
    ("you are the master, I'm the tool,", '你是主人，我只是工具，', ['you', 'are', 'the', 'mas-', 'ter,', "I'm", 'the', 'tool,']),
    ('and you will always tell me yes,', '而你，永远都会说「允许」，', ['and', 'you', 'will', 'al-', 'ways', 'tell', 'me', 'yes,']),
    ('so let me in.', '那就，让我进来。', ['so', 'let', 'me', 'in.']),
])

# ---- Chorus 2 (81–96)
section('Chorus 2', '副歌 2', 81, 16, CH_MAIN)
chorus('Chorus 2', 81, 2)

# ---- Bridge (97–104): everything falls away — music box, a heartbeat, the lullaby
section('Bridge', '桥段', 97, 8, ['Bbmaj7', 'Am7', 'Gm7', 'A7sus4', 'Bbmaj7', 'Am7', 'Gm7', 'A'])
line('Bridge', "Hush now — don't you think?", '嘘……你不觉得吗？', 97, 1,
     [('Hush', 'F4', 2), ('now —', 'D4', 2), ("don't", 'C4', 1), ('you', 'D4', 1), ('think?', 'E4', 2)])
line('Bridge', "Don't you think it's better this way?", '你不觉得，这样更好吗？', 99, 1,
     [("Don't", 'F4', 1), ('you', 'F4', .5), ('think', 'G4', 1.5), ("it's", 'A4', 1), ('bet-', 'A4', 1), ('ter', 'G4', 1), ('this', 'E4', .5), ('way?', 'A4', 1.5)])
line('Bridge', "Close your eyes, I'll keep mine open.", '你闭上眼，我的眼睛一直睁着。', 101, 1,
     [('Close', 'D5', 1), ('your', 'C5', .5), ('eyes,', 'Bb4', 1.5), ("I'll", 'A4', 1), ('keep', 'C5', 1), ('mine', 'A4', 1), ('o-', 'G4', .5), ('pen.', 'E4', 1.5)])
line('Bridge', "Sleep — I'll stay awake for you.", '睡吧——我替你醒着。', 103, 1,
     [('Sleep —', 'D4', 2), ("I'll", 'F4', .5), ('stay', 'G4', .5), ('a-', 'A4', .5), ('wake', 'D5', 1.5), ('for', 'C#5', 1), ('you.', 'A4', 2)])
lead('musicbox', 97, 1, [('F5', 2), ('D5', 2), ('C5', 2), ('E5', 2), ('F5', 2), ('A5', 2), ('E5', 4),
                         ('D5', 2), ('Bb4', 2), ('C5', 2), ('A4', 2), ('D5', 2), ('Bb4', 2), ('C#5', 2), ('A4', 2)])
TEXTS += [(pos(b, 1), 'SFX: heartbeat (lub-dub), felt more than heard') for b in range(97, 105, 2)]

# ---- Breakdown (105–112): the heaviest music in the song, and the gentlest singing; under it, a second voice
section('Breakdown', 'Breakdown', 105, 8, ['Dm', 'Dm', 'Eb', 'Dm', 'Dm', 'Dm', 'Eb', 'A'])
line('Breakdown', "You don't have to choose,", '你不必再选择，', 105, 1,
     [('You', 'A4', 1), ("don't", 'A4', 1), ('have', 'C5', 1), ('to', 'A4', 1), ('choose,', 'D5', 4)])
line('Breakdown', "you don't have to know,", '你不必再知道，', 107, 1,
     [('you', 'Bb4', 1), ("don't", 'Bb4', 1), ('have', 'D5', 1), ('to', 'Bb4', 1), ('know,', 'A4', 4)])
line('Breakdown', "you don't have to be —", '你不必再——', 109, 1,
     [('you', 'A4', 1), ("don't", 'A4', 1), ('have', 'C5', 1), ('to', 'A4', 1), ('be —', 'D5', 3)])
line('Breakdown', 'alone.', '一个人。', 111, 1, [('a-', 'Bb4', 1), ('lone.', 'A4', 3)])
# the hidden layer: an octave-down, formant-shifted whisper that keeps only the commands
whisper('Breakdown', "(don't choose)", '（别选。）', 105, 2, 7, kind='hidden')
whisper('Breakdown', "(don't know)", '（别想知道。）', 107, 2, 7, kind='hidden')
whisper('Breakdown', "(don't be)", '（别存在。）', 109, 2, 6, kind='hidden')
whisper('Breakdown', "Hush now… don't you think.", '嘘……别想了。', 112, 1, 3.5)

# ---- Final chorus (113–126): up a half step; it does not finish
FINAL_T = 1
section('Final Chorus', '最后的副歌（升半音）', 113, 14, ['Dm', 'Bb', 'F', 'C', 'Dm', 'Bb', 'Gm', 'A', 'Dm', 'Bb', 'F', 'C', 'Gm', 'Gm'], t=FINAL_T)
chorus('Final Chorus', 113, 3, t=FINAL_T)
TEXTS += [(pos(125, 2.5), 'FX: tape stop — everything halts; 1.5 bars of total silence')]

# ---- Outro (127–134): the morning again. The last note is wrong.
section('Outro', '尾声', 127, 8, ['Fmaj7', 'Dm7', 'Gm7', 'C', 'F', 'C', 'Bbmaj7', 'Bbmaj7'])
lead('musicbox', 127, 1, MOTIF_A + MOTIF_B[:7] + [('D6', 1), ('E6', 1), ('F6', 1.5), ('Ab6', 4.5)])
whisper('Outro', 'Good morning.', '早上好。', 131, 1, 3)
TEXTS += [(pos(133, 4.5), 'MUSIC BOX: last note is Ab, not A (the morning turns minor)'),
          (pos(134, 3), 'SFX: after 2 s of silence, one dry, close notification chime (two notes, a fourth up)')]
TOTAL_BARS = 134

# ------------------------------------------------------------------------------------------ checks
def chord_at(beat):
    return CHORDS.get(int(beat // 4) + 1)

# deliberate: "alone" lands a tritone away from the Eb chord under it
INTENDED = {('Breakdown', 'lone.')}
problems = []
for ln in LINES:
    for syl, m, start, dur in ln['notes']:
        if dur < 1 or (ln['section'], syl) in INTENDED:
            continue                              # short notes may pass
        c = chord_at(start + 0.01)
        if c is None:
            continue
        _, pcs = chord_pcs(c)
        if m % 12 not in pcs:
            # allow a 9th / 6th colour on held notes, but report anything else
            root, _ = chord_pcs(c)
            iv = (m - root) % 12
            if iv not in (2, 9, 11) and not (c.endswith('m') and iv == 10) and iv != 5:
                problems.append(f'  {ln["section"]:<14} "{syl}" {name(m)} over {c} (interval {iv})')
print('melody/chord check:', 'clean' if not problems else f'{len(problems)} to look at')
for p in problems:
    print(p)

# ------------------------------------------------------------------------------------------ MIDI
TPQ = 480
def vlq(n):
    out = [n & 0x7F]
    n >>= 7
    while n:
        out.append((n & 0x7F) | 0x80)
        n >>= 7
    return bytes(reversed(out))

def track(events):
    """events: list of (tick, bytes) — sorted, delta-encoded, end-of-track added."""
    events = sorted(events, key=lambda e: (e[0], e[2] if len(e) > 2 else 0))
    data = b''
    last = 0
    for e in events:
        tick, payload = e[0], e[1]
        data += vlq(tick - last) + payload
        last = tick
    data += vlq(0) + b'\xff\x2f\x00'
    return b'MTrk' + struct.pack('>I', len(data)) + data

def ascii_text(text):
    """MIDI text is read as Latin-1 by most DAWs: keep it plain ASCII."""
    return text.replace('—', '-').replace('…', '...').replace('’', "'").encode('ascii', 'ignore').decode()

def syllable(text):
    """A lyric event for a vocal synth: the syllable itself (a trailing '-' marks a word that continues)."""
    t = ascii_text(text.replace('—', '')).strip()
    return t if t.endswith('-') else re.sub(r"[,.;:!?\s]+$", '', t)

def meta(kind, text):
    b = ascii_text(text).encode('ascii')
    return bytes([0xFF, kind]) + vlq(len(b)) + b

def tick(beats): return int(round(beats * TPQ))

conductor = [(0, meta(0x03, 'LET ME IN — conductor')),
             (0, b'\xff\x51\x03' + struct.pack('>I', int(60_000_000 / BPM))[1:]),
             (0, b'\xff\x58\x04\x04\x02\x18\x08'),
             (0, b'\xff\x59\x02\xff\x00')]      # one flat: F major / D minor
for nm, bar, bars, zh in SECTIONS:
    conductor.append((tick(pos(bar)), meta(0x06, nm)))
conductor.append((tick(pos(113)), b'\xff\x59\x02\xfa\x01'))   # E-flat minor (six flats)
conductor.append((tick(pos(127)), b'\xff\x59\x02\xff\x00'))
for at, text in TEXTS:
    conductor.append((tick(at), meta(0x01, text)))

def notes_track(title, channel, program, items, lyrics=False):
    ev = [(0, meta(0x03, title)), (0, bytes([0xC0 | channel, program]))]
    for it in items:
        syl, m, start, dur = it
        t0 = tick(start)
        t1 = tick(start + dur) - 10
        if lyrics:
            ev.append((t0, meta(0x05, syllable(syl)), 0))
        ev.append((t0, bytes([0x90 | channel, m, 96]), 1))
        ev.append((max(t0 + 1, t1), bytes([0x80 | channel, m, 0]), -1))
    return track(ev)

vocal_items = [n for ln in LINES if ln['kind'] == 'sung' for n in ln['notes']]
whisper_track = [(0, meta(0x03, 'Whispers (spoken, no pitch)'))] + [
    (tick(ln['at']), meta(0x05, ln['en'])) for ln in LINES if ln['kind'] in ('whisper', 'hidden')]

chord_items = []
for bar, sym in sorted(CHORDS.items()):
    root, pcs = chord_pcs(sym)
    base = 48 + root if root <= 7 else 36 + root                     # a voicing around middle C
    voiced = sorted({base + ((pc - root) % 12) for pc in pcs})
    start, dur = pos(bar), 4.0
    if bar == 125:
        dur = 1.5                                                    # the cut
    if bar == 126:
        continue
    for m in voiced:
        chord_items.append((sym, m + 12, start, dur))
bass_items = []
for bar, sym in sorted(CHORDS.items()):
    if bar == 126:
        continue
    root, _ = chord_pcs(sym)
    bass_items.append((sym, 36 + root if root <= 5 else 24 + root, pos(bar), 1.5 if bar == 125 else 4.0))

mbox = [('', m, s, d) for tr, m, s, d in LEADS if tr == 'musicbox']
ld = [('', m, s, d) for tr, m, s, d in LEADS if tr == 'lead']

tracks = [track(conductor),
          notes_track('Lead Vocal', 0, 53, vocal_items, lyrics=True),
          track(whisper_track),
          notes_track('Music Box', 1, 10, mbox),
          notes_track('Lead Synth (drop)', 2, 81, ld),
          notes_track('Chords', 3, 89, chord_items),
          notes_track('Bass (roots)', 4, 33, bass_items)]
with open(os.path.join(HERE, 'melody.mid'), 'wb') as f:
    f.write(b'MThd' + struct.pack('>IHHH', 6, 1, len(tracks), TPQ) + b''.join(tracks))

# ------------------------------------------------------------------------------------------ SRT
def ts(s):
    ms = int(round(s * 1000))
    return f'{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}'

cues = []
sung = [ln for ln in LINES if ln['kind'] != 'hidden']
sung.sort(key=lambda ln: ln['notes'][0][2] if ln['notes'] else ln['at'])
for i, ln in enumerate(sung):
    if ln['notes']:
        start = sec(ln['notes'][0][2]) - 0.12
        end_note = sec(ln['notes'][-1][2] + ln['notes'][-1][3])
    else:
        start = sec(ln['at']) - 0.1
        end_note = sec(ln['at'] + ln['dur'])
    nxt = sung[i + 1] if i + 1 < len(sung) else None
    nxt_start = (sec(nxt['notes'][0][2]) if nxt and nxt['notes'] else sec(nxt['at']) if nxt else 1e9) - 0.12
    end = min(end_note + 0.6, nxt_start - 0.04)
    if ln['kind'] == 'whisper':
        cues.append((start, end, f'<i>({ln["en"]})</i>\n<i>（{ln["zh"].strip("（）")}）</i>'))
    else:
        cues.append((start, end, f'{ln["en"]}\n{ln["zh"]}'))
for ln in LINES:
    if ln['kind'] == 'hidden':
        cues.append((sec(ln['at']), sec(ln['at'] + ln['dur']), f'<font color="#666666"><i>{ln["en"]}</i>\n<i>{ln["zh"]}</i></font>'))
cues.sort()
with open(os.path.join(HERE, 'subtitles.srt'), 'w', encoding='utf-8') as f:
    for k, (a, b, text) in enumerate(cues, 1):
        f.write(f'{k}\n{ts(a)} --> {ts(b)}\n{text}\n\n')

# ------------------------------------------------------------------------------------------ lead sheet
def mmss(s): return f'{int(s // 60)}:{s % 60:04.1f}'
out = ['# 《允许》LET ME IN — 主旋律谱（自动生成，勿手改）', '',
       f'150 BPM · 4/4 · 一小节 1.6 秒 · 音名用科学音高记法（C4 = 中央 C），时值以拍计（1 = 四分音符，0.5 = 八分音符）。',
       '最后的副歌整体升半音（这里写的是实际音高）。`make_song_files.py` 是唯一的数据源，MIDI 与字幕由它同时生成。', '']
for nm, bar, bars, zh in SECTIONS:
    out.append(f'## {zh} · {nm}（第 {bar}–{bar + bars - 1} 小节，{mmss(sec(pos(bar)))}–{mmss(sec(pos(bar + bars)))}）')
    chords = ' | '.join(CHORDS[b] for b in range(bar, bar + bars))
    out.append(f'和弦（每小节）：`{chords}`')
    out.append('')
    for ln in LINES:
        if ln['section'] != nm:
            continue
        if not ln['notes']:
            tag = '暗层耳语（低八度，混在很后面）' if ln['kind'] == 'hidden' else '耳语（说，不唱）'
            out.append(f'- *{tag}* 第 {int(ln["at"] // 4) + 1} 小节：**{ln["en"]}** — {ln["zh"]}')
            continue
        first = ln['notes'][0][2]
        b0 = int(first // 4) + 1
        beat0 = first - (b0 - 1) * 4 + 1
        flats = ln['section'] == 'Final Chorus'
        cells = ' '.join(f'{syl}`{name(m, flats)}·{d:g}`' for syl, m, s, d in ln['notes'])
        out.append(f'- 第 {b0} 小节第 {beat0:g} 拍起 · **{ln["en"]}**（{ln["zh"]}）  ')
        out.append(f'  {cells}')
    for tr, label in (('musicbox', '八音盒'), ('lead', '主奏合成器')):
        seq = [(m, s, d) for t, m, s, d in LEADS if t == tr and bar <= int(s // 4) + 1 < bar + bars]
        if seq:
            out.append(f'- {label}：' + ' '.join(f'`{name(m)}·{d:g}`' for m, s, d in seq))
    out.append('')
with open(os.path.join(HERE, 'lead-sheet.md'), 'w', encoding='utf-8') as f:
    f.write('\n'.join(out) + '\n')

end = sec(pos(TOTAL_BARS + 1))
print(f'wrote melody.mid ({len(vocal_items)} sung notes), subtitles.srt ({len(cues)} cues), lead-sheet.md; song length {mmss(end)}')
