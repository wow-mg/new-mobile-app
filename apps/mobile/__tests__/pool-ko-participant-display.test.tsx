import React from 'react';
import { cleanup, render, screen } from '@testing-library/react-native';
import { BracketScreen, GamesScreen, resetParticipantFlow, startParticipantSession } from '../src/app';

expect.addSnapshotSerializer({
  test: (value) => typeof value === 'string' && value.endsWith('/assets/happickle_logo.png'),
  print: () => '"<asset:happickle_logo.png>"',
});

jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(() => ({})),
  router: { push: jest.fn() },
}));

describe('POOL+KO participant published display flow', () => {
  beforeEach(() => {
    resetParticipantFlow();
    startParticipantSession();
  });

  afterEach(() => cleanup());

  it('renders published division list, derived pool standings, KO bracket, bye/withdrawal states, and print links', () => {
    render(React.createElement(BracketScreen));

    expect(screen.getByTestId('pool-ko-division-list')).toHaveTextContent(/오픈 혼합복식 · POOL\+KO/);
    expect(screen.getByTestId('pool-standings')).toHaveTextContent(/1위 · 김민준 \/ 이서연/);
    expect(screen.getByTestId('pool-standings')).toHaveTextContent(/2승 0패 · 득실 20/);
    expect(screen.getByTestId('pool-match-list')).toHaveTextContent(/최현우 \/ 송지민 \(기권\)/);
    expect(screen.getByTestId('pool-match-list')).toHaveTextContent(/부상 기권 · 잔여 경기 몰수 처리/);
    expect(screen.getByTestId('ko-bracket-view')).toHaveTextContent(/BYE/);
    expect(screen.getByTestId('ko-bracket-view')).toHaveTextContent(/부전승으로 다음 라운드 진출/);
    expect(screen.getByTestId('personal-schedule')).toHaveTextContent(/김민준 \/ 이서연 vs 박지훈 \/ 정수빈/);
    expect(screen.getByTestId('print-pdf-links')).toHaveTextContent(/대진표 PDF 보기/);
    expect(screen.getByTestId('print-pdf-links')).toHaveTextContent(/개인 일정 인쇄/);
  });

  it('keeps the existing app games route compatible while bracket route owns POOL+KO details', () => {
    const view = render(React.createElement(GamesScreen));
    expect(screen.getByTestId('games-layout-hero')).toHaveTextContent(/신청한 경기 일정/);
    expect(screen.queryByTestId('pool-ko-division-list')).toBeNull();
    expect(view.toJSON()).toMatchSnapshot();
  });

  it('captures the participant bracket snapshot for pool and KO published states', () => {
    const view = render(React.createElement(BracketScreen));
    expect(view.toJSON()).toMatchSnapshot();
  });
});
