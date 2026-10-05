import React, { useState } from 'react';
import { render, screen, within, fireEvent, waitFor, act } from '@testing-library/react';
import axios from 'axios';
import { useLiveChat, LiveChatPanel } from './LiveChat';

jest.mock('axios', () => ({ get: jest.fn(), post: jest.fn() }));
window.HTMLElement.prototype.scrollIntoView = jest.fn();

const me = { id: 'uA', full_name: 'Alice' };
const users = [{ id: 'uB', full_name: 'Bob' }, { id: 'uC', full_name: 'Carol' }];
const msg = (id, sender, recipient, body) => ({ id, sender_id: sender, recipient_id: recipient, body, created_at: '2026-01-01T10:00:00Z', sender_name: sender });

const baseChat = (over = {}) => ({
  users, messages: [], statuses: {}, connError: '', unreadByThread: {}, totalUnread: 0, send: jest.fn().mockResolvedValue(), ...over,
});

describe('LiveChatPanel', () => {
  test('nothing is open until a conversation is chosen', () => {
    render(<LiveChatPanel user={me} chat={baseChat()} activeThread={null} setActiveThread={() => {}} />);
    expect(screen.getByText(/Choose/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/message/i)).toBeNull();
  });

  test('lists Everyone + users, shows unread badge, selecting calls setActiveThread', () => {
    const setActive = jest.fn();
    render(<LiveChatPanel user={me} chat={baseChat({ unreadByThread: { uB: 3 } })} activeThread={null} setActiveThread={setActive} />);
    expect(screen.getAllByText('Everyone').length).toBeGreaterThan(0);
    expect(screen.getByText('3')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Bob'));
    expect(setActive).toHaveBeenCalledWith('uB');
  });

  test('only the selected conversation is shown, with ticks on my messages only', () => {
    const messages = [msg(1, 'uA', 'uB', 'hello bob'), msg(2, 'uB', 'uA', 'hi alice'), msg(3, 'uA', 'uC', 'secret for carol')];
    const { container } = render(<LiveChatPanel user={me} chat={baseChat({ messages, statuses: { 1: 'read', 3: 'sent' } })} activeThread="uB" setActiveThread={() => {}} />);
    const bubbles = container.querySelector('.ja-lc-msgs');
    expect(within(bubbles).getByText(/hello bob/)).toBeInTheDocument();
    expect(within(bubbles).getByText(/hi alice/)).toBeInTheDocument();
    expect(within(bubbles).queryByText(/secret for carol/)).toBeNull();
    expect(screen.getAllByTitle('Read')).toHaveLength(1);
    expect(screen.queryByTitle('Sent')).toBeNull();
  });

  test('broadcast bubbles from others show the sender name; sending to Everyone uses the "all" thread', async () => {
    const chat = baseChat({ messages: [msg(1, 'uB', null, 'to everyone')] });
    const { container } = render(<LiveChatPanel user={me} chat={chat} activeThread="all" setActiveThread={() => {}} />);
    expect(container.querySelector('.ja-lc-who')).toHaveTextContent('uB');
    fireEvent.change(screen.getByPlaceholderText(/Message everyone/), { target: { value: 'ping' } });
    fireEvent.keyDown(screen.getByPlaceholderText(/Message everyone/), { key: 'Enter' });
    await waitFor(() => expect(chat.send).toHaveBeenCalledWith('all', 'ping'));
  });

  test('shows the connection error banner', () => {
    render(<LiveChatPanel user={me} chat={baseChat({ connError: 'Reconnecting to chat…' })} activeThread={null} setActiveThread={() => {}} />);
    expect(screen.getByText('Reconnecting to chat…')).toBeInTheDocument();
  });
});

describe('useLiveChat', () => {
  const Harness = ({ visible }) => {
    const [thread, setThread] = useState(null);
    const chat = useLiveChat(me, thread, visible);
    return (
      <div>
        <span data-testid="total">{chat.totalUnread}</span>
        <span data-testid="unreadB">{chat.unreadByThread.uB || 0}</span>
        <button onClick={() => setThread('uB')}>open-B</button>
      </div>
    );
  };

  beforeEach(() => {
    axios.get.mockReset(); axios.post.mockReset();
    axios.post.mockResolvedValue({ data: { success: true } });
    axios.get.mockImplementation((url) => Promise.resolve({
      data: url.startsWith('/api/chat/users')
        ? { users }
        : { messages: [msg(5, 'uB', 'uA', 'ping')], statuses: {}, unread: { uB: 2 } },
    }));
  });

  test('unread counts come from the server, not from browser storage', async () => {
    render(<Harness visible />);
    await waitFor(() => expect(screen.getByTestId('total')).toHaveTextContent('2'));
    expect(axios.post).not.toHaveBeenCalled(); // no conversation selected -> nothing marked read
  });

  test('opening a conversation reports it read and clears its badge', async () => {
    render(<Harness visible />);
    await waitFor(() => expect(screen.getByTestId('unreadB')).toHaveTextContent('2'));
    await act(async () => { fireEvent.click(screen.getByText('open-B')); });
    await waitFor(() => expect(axios.post).toHaveBeenCalledWith('/api/chat/read', { thread: 'uB' }, expect.anything()));
    expect(screen.getByTestId('unreadB')).toHaveTextContent('0');
  });

  test('a hidden chat window never reports messages as read', async () => {
    render(<Harness visible={false} />);
    await waitFor(() => expect(screen.getByTestId('total')).toHaveTextContent('2'));
    await act(async () => { fireEvent.click(screen.getByText('open-B')); });
    expect(axios.post).not.toHaveBeenCalled();
  });
});
