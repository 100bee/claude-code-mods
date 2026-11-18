# waddle-duck-windows

윈도우 터미널용 [waddle-duck](../waddle-duck)입니다. 맥에서는 `waddle-duck`을 쓰세요.

Claude Code가 작업하는 동안(프롬프트를 보낸 뒤 답이 끝날 때까지) 프롬프트 위 띠에서 엄마 오리와 그 뒤를 쫓는 새끼 오리들이 왼쪽에서 오른쪽으로 뒤뚱뒤뚱 걸어가고, 아래에 이번 턴 경과 시간을 보여주는 mod입니다. 작업이 끝나면 오리는 사라집니다. 같은 띠를 쓰는 다른 mod(token-weather 등)의 출력은 오리 아래에 그대로 남습니다.

## 설치

Claude Code 터미널의 프롬프트에서:

```
/plugin install waddle-duck-windows --marketplace 100bee/claude-code-mods
```

`Add marketplace?`에 `y`, 설치 범위는 `user`에서 Enter. 재시작 없이 바로 동작합니다. Claude Code v2.1.287 이상.

## 크기와 새끼 수

Claude Code 프롬프트에서 바로 바꿀 수 있고, 고른 크기는 다음 세션에도 유지됩니다.

- `/duck m`: 중간 오리 (터미널 6줄 + 바닥 1줄, 기본값)
- `/duck l`: 큰 오리 (8줄 + 바닥 1줄, 더 세밀함)
- `/duck 0` ~ `/duck 3`: 새끼 오리 수 (기본 3마리)
- `/duck off`, `/duck on`: 오리 끄기, 켜기 (다음 세션에도 유지)
- `/duck`: 지금 설정 확인

## 계절 옷 (chat-theme과 함께)

[chat-theme](../chat-theme) mod를 같이 쓰면 `/theme-chat`으로 고른 팔레트를 따라 옷과 바닥이 바뀝니다. `/theme-chat auto`면 계절이 바뀔 때 저절로 갈아입어요.

| 팔레트 | 엄마 | 새끼 | 바닥 · 날씨 |
|---|---|---|---|
| `default` (또는 chat-theme 없음) | 맨몸 | 맨몸 | 잔디 |
| `spring` | 머리에 벚꽃, 등에 꽃잎 | 꽃잎 한 장씩 | 꽃잎 떨어진 잔디 · 벚꽃잎이 날림 |
| `summer` | 선글라스, 줄무늬 튜브 | 튜브 | 물결 |
| `autumn` | 베레모, 목도리 | 목도리 | 낙엽 깔린 흙길 |
| `winter` | 방울 털모자, 목도리 | 털모자 | 눈밭 · 눈이 내림 |

모자를 쓰는 계절은 모자 자리만큼 1줄 커지고, 튜브를 끼는 여름은 오리 사이 간격이 조금 넓어집니다.

## 조절

`hooks/register.tsx`에서
- `TICK_MS`: 걷는 속도 (작을수록 빠름)
- `PALETTE`: 오리 색
- `M`, `L`: 크기별 엄마(`mom`)·새끼(`baby`) 픽셀 모양. `height`는 프레임 줄 수(짝수), `gap`은 오리 사이 간격

## 참고

- 터미널에서는 반칸 블록 문자(▀ ▄)로 그립니다. 오리가 찌그러져 보이면 터미널 설정에서 "모호한 폭 문자(Ambiguous width)"를 1칸(narrow)으로 두세요.
- 오리는 터미널(CLI)에서만 걷습니다. 데스크톱 앱, VS Code, 모바일에서는 그리지 않습니다(`/duck` 명령은 그대로 동작).
