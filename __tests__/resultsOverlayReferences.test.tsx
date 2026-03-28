import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { ResultsOverlay } from '../src/app/ui/components/overlays/ResultsOverlay';

const mockCardBlock = jest.fn();
const mockRulesBlock = jest.fn();

jest.mock('../src/app/ui/components/panels/ContentPanel', () => {
  const ReactNative = require('react-native');
  return {
    ContentPanel: ({ children }: { children?: React.ReactNode }) => (
      <ReactNative.View>{children}</ReactNative.View>
    ),
  };
});
jest.mock('../src/app/ui/components/content/CardReferenceSection', () => {
  const ReactNative = require('react-native');
  return {
    CardReferenceSection: (props: unknown) => {
      mockCardBlock(props);
      return <ReactNative.Text>CardReferenceSection</ReactNative.Text>;
    },
  };
});
jest.mock('../src/app/ui/components/content/SelectedRulesSection', () => {
  const ReactNative = require('react-native');
  return {
    SelectedRulesSection: (props: unknown) => {
      mockRulesBlock(props);
      return <ReactNative.Text>SelectedRulesSection</ReactNative.Text>;
    },
  };
});

jest.mock('../src/shared/logging', () => ({
  logInfo: jest.fn(),
}));

describe('ResultsOverlay cited references', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('applies playActAccessibilityLabel to the root container when provided (Cycle 10)', async () => {
    const ReactNative = require('react-native');
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <ResultsOverlay
          responseText={null}
          validationSummary={null}
          isAsking={false}
          processingSubstate={null}
          error={null}
          revealedBlocks={{
            answer: false,
            cards: false,
            rules: false,
            sources: false,
          }}
          revealBlock={jest.fn()}
          setRevealedBlocks={jest.fn()}
          updatePanelRect={jest.fn()}
          clearPanelRect={jest.fn()}
          theme={{
            text: '#fff',
            textMuted: '#999',
            background: '#000',
            border: '#333',
            primary: '#f00',
            warning: '#ff0',
          }}
          intensity="subtle"
          reduceMotion
          emitEvent={jest.fn()}
          showContentPanels
          canRevealPanels
          playActAccessibilityLabel="Play act phase label for overlay region"
        />,
      );
    });
    const labeled = renderer!.root.findAll(
      (node: TestRenderer.ReactTestInstance) =>
        node.type === ReactNative.View &&
        node.props.accessibilityLabel ===
          'Play act phase label for overlay region',
    );
    expect(labeled.length).toBeGreaterThanOrEqual(1);
    await act(async () => {
      renderer!.unmount();
    });
  });

  it('passes settled card and rule reference content into the cards and rules blocks', async () => {
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <ResultsOverlay
          responseText="Blood Moon turns nonbasic lands into Mountains."
          validationSummary={{
            cards: [
              {
                raw: 'blood moon',
                canonical: 'Blood Moon',
                doc_id: 'oracle:blood-moon',
                oracleText: undefined,
                status: 'in_pack',
              },
              {
                raw: 'blood moon',
                canonical: 'Blood Moon',
                doc_id: 'oracle:blood-moon',
                oracleText: 'Nonbasic lands are Mountains.',
                status: 'in_pack',
              },
            ],
            rules: [
              {
                raw: '305.7',
                canonical: '305.7',
                title: '305.7',
                excerpt:
                  "If an effect sets a land's subtype to one or more of the basic land types, the land loses all abilities and gains the corresponding mana abilities.",
                status: 'valid',
              },
            ],
            stats: {
              cardHitRate: 1,
              ruleHitRate: 1,
              unknownCardCount: 0,
              invalidRuleCount: 0,
            },
          }}
          isAsking={false}
          processingSubstate={null}
          error={null}
          revealedBlocks={{ answer: false, cards: true, rules: true, sources: false }}
          revealBlock={jest.fn()}
          setRevealedBlocks={jest.fn()}
          updatePanelRect={jest.fn()}
          clearPanelRect={jest.fn()}
          theme={{
            text: '#fff',
            textMuted: '#999',
            background: '#000',
            border: '#333',
            primary: '#f00',
            warning: '#ff0',
          }}
          intensity="subtle"
          reduceMotion={true}
          emitEvent={jest.fn()}
          showContentPanels={true}
          canRevealPanels={true}
        />,
      );
    });

    expect(mockCardBlock).toHaveBeenCalledWith(
      expect.objectContaining({
        cards: [
          expect.objectContaining({
            id: 'oracle:blood-moon',
            name: 'Blood Moon',
            oracle: 'Nonbasic lands are Mountains.',
          }),
        ],
      }),
    );
    expect(mockCardBlock.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        cards: [
          expect.objectContaining({
            id: 'oracle:blood-moon',
            name: 'Blood Moon',
            oracle: 'Nonbasic lands are Mountains.',
          }),
        ],
      }),
    );
    expect(mockCardBlock.mock.calls[0][0].cards).toHaveLength(1);
    expect(mockRulesBlock).toHaveBeenCalledWith(
      expect.objectContaining({
        rules: [
          expect.objectContaining({
            id: '305.7',
            title: '305.7',
            excerpt:
              "If an effect sets a land's subtype to one or more of the basic land types, the land loses all abilities and gains the corresponding mana abilities.",
            used: true,
          }),
        ],
      }),
    );

    await act(async () => {
      renderer!.unmount();
    });
  });
});
