# waddle-duck

Claude Code가 작업하는 동안(프롬프트를 보낸 뒤 답이 끝날 때까지) 프롬프트 위 띠에서 엄마 오리와 그 뒤를 쫓는 새끼 오리들이 왼쪽에서 오른쪽으로 뒤뚱뒤뚱 걸어가고, 아래에 이번 턴 경과 시간을 보여주는 mod입니다. 작업이 끝나면 오리는 사라집니다. 같은 띠를 쓰는 다른 mod(token-weather 등)의 출력은 오리 아래에 그대로 남습니다.

## 설치

Claude Code 터미널의 프롬프트에서:

```
/plugin install waddle-duck --marketplace 100bee/claude-code-mods
```

`Add marketplace?`에 `y`, 설치 범위는 `user`에서 Enter. 재시작 없이 바로 동작합니다. Claude Code v2.1.287 이상.

## 크기와 새끼 수

Claude Code 프롬프트에서 바로 바꿀 수 있고, 고른 크기는 다음 세션에도 유지됩니다.

- `/duck s`: 작은 오리 (터미널 4줄)
- `/duck m`: 중간 오리 (8줄, 기본값)
- `/duck l`: 큰 오리 (12줄)
- `/duck 0` ~ `/duck 3`: 새끼 오리 수 (기본 3마리)
- `/duck off`, `/duck on`: 오리 끄기, 켜기 (다음 세션에도 유지)
- `/duck`: 지금 설정 확인

## 조절

`hooks/register.tsx`에서
- `TICK_MS`: 걷는 속도 (작을수록 빠름)
- `PALETTE`: 오리 색
- `S`, `M`, `L`: 크기별 엄마(`mom`)·새끼(`baby`) 픽셀 모양. `height`는 프레임 줄 수(짝수), `gap`은 오리 사이 간격

## 참고

- 맥 터미널용으로, 픽셀마다 배경색 칠한 공백 2칸으로 그립니다 (모호한 폭·줄 간격 설정과 무관).
- 데스크톱 앱 Code 탭에서는 픽셀 대신 🐥 🐥 🐥 🦆 글자가 걸어갑니다.
