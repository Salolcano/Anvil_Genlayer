'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CONTRACT_ADDRESS,
  EXPLORER,
  RPC_URL,
  CHAIN_ID,
  connectWallet,
  formatGen,
  hasWallet,
  parseGen,
  readBoard,
  sendWrite,
  shortAddress,
} from '../lib/anvil';

export default function Home() {
  const [account, setAccount] = useState('');
  const [board, setBoard] = useState({ bounties: [], submissions: [], stats: {} });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [openId, setOpenId] = useState(null);

  const say = useCallback((text, isError) => {
    setToast({ text, isError: !!isError });
    if (!isError) setTimeout(() => setToast(null), 6000);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await readBoard();
      setBoard(next);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 15000);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!hasWallet()) return;
    window.ethereum
      .request({ method: 'eth_accounts' })
      .then((list) => list && list[0] && setAccount(list[0]))
      .catch(() => {});
    const onAccounts = (list) => setAccount((list && list[0]) || '');
    window.ethereum.on && window.ethereum.on('accountsChanged', onAccounts);
    return () => {
      window.ethereum.removeListener &&
        window.ethereum.removeListener('accountsChanged', onAccounts);
    };
  }, []);

  async function connect() {
    try {
      const address = await connectWallet();
      setAccount(address);
      say('Wallet connected to Studio Next.');
    } catch (err) {
      say(err.message || String(err), true);
    }
  }

  async function run(method, args, value) {
    if (!account) {
      say('Connect a wallet first.', true);
      return false;
    }
    setBusy(true);
    try {
      await sendWrite({ account, method, args, value, onStatus: (s) => say(s) });
      say('Done. Reading the new chain state…');
      await refresh();
      setTimeout(refresh, 4000);
      return true;
    } catch (err) {
      console.error(err);
      say(err?.shortMessage || err?.message || String(err), true);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const stats = board.stats || {};
  const configured = !!CONTRACT_ADDRESS;

  return (
    <>
      <header className="bar">
        <div className="wrap bar-inner">
          <div className="logo">
            <span className="mark" />
            ANVIL
          </div>
          <nav>
            <a href="#how">How it works</a>
            <a href="#board">Board</a>
            <a href="#post">Post a bounty</a>
          </nav>
          <button className="btn primary" onClick={connect} disabled={busy}>
            {account ? shortAddress(account) : 'Connect wallet'}
          </button>
        </div>
      </header>

      <section className="hero">
        <div className="wrap">
          <h1>
            Post the work.
            <br />
            Ship the repo.
            <br />
            <em>The contract decides.</em>
          </h1>
          <p className="lede">
            ANVIL is a bounty board with no jury. A sponsor writes a spec and locks a
            prize. Builders enter a public GitHub repo. Then the intelligent contract
            itself opens every repository, reads it against the sponsor&apos;s criteria,
            publishes a scored verdict on chain and releases the prize to the winner.
          </p>
          <div className="hero-actions">
            <a className="btn primary" href="#board">
              Browse the board
            </a>
            <a className="btn" href="#post">
              Post a bounty
            </a>
            <a className="btn ghost" href={EXPLORER} target="_blank" rel="noreferrer">
              View on explorer ↗
            </a>
          </div>

          <div className="stats">
            <div>
              <span className="mono-label">Bounties</span>
              <div className="n">{stats.bounties ?? 0}</div>
            </div>
            <div>
              <span className="mono-label">Open now</span>
              <div className="n">{stats.open ?? 0}</div>
            </div>
            <div>
              <span className="mono-label">Judged</span>
              <div className="n">{stats.settled ?? 0}</div>
            </div>
            <div>
              <span className="mono-label">In escrow</span>
              <div className="n">{formatGen(stats.escrowed || 0)} GEN</div>
            </div>
          </div>

          {!configured && (
            <div className="notice">
              <strong>Not configured.</strong> Set the environment variable
              NEXT_PUBLIC_CONTRACT_ADDRESS to your deployed Anvil contract address and
              redeploy the site.
            </div>
          )}
        </div>
      </section>

      <section className="block" id="how">
        <div className="wrap">
          <h2 className="section">Process</h2>
          <h3 className="big">Four steps, all of them on chain</h3>
          <div className="steps">
            <Step
              n="01"
              title="Sponsor posts"
              text="Write a title, a specification and the judging criteria. Attach a prize in GEN — it is escrowed by the contract the moment the transaction lands."
            />
            <Step
              n="02"
              title="Builders enter"
              text="Anyone submits a public GitHub repo URL plus a short note. One repo per bounty. The entry is a transaction, so the timestamp and the author are permanent."
            />
            <Step
              n="03"
              title="The contract reads the code"
              text="Calling Judge makes the contract fetch every submitted repository page itself and hand the contents to an LLM together with the sponsor's criteria."
            />
            <Step
              n="04"
              title="Consensus pays out"
              text="Validators re-run the same judgement and must agree on the winner before it counts. The verdict and every score are stored on chain and the escrow is sent to the winner."
            />
          </div>
        </div>
      </section>

      <section className="block" id="board">
        <div className="wrap">
          <h2 className="section">Live board</h2>
          <h3 className="big">Open bounties</h3>

          {loading && <p className="muted">Reading the board from Studio Next…</p>}
          {!loading && board.bounties.length === 0 && (
            <div className="card">
              <p style={{ margin: 0 }}>
                Nothing posted yet. Be the first — scroll down to{' '}
                <a href="#post">post a bounty</a>.
              </p>
            </div>
          )}

          {board.bounties
            .slice()
            .reverse()
            .map((bounty) => (
              <Bounty
                key={bounty.id}
                bounty={bounty}
                submissions={board.submissions.filter((s) => s.bounty_id === bounty.id)}
                expanded={openId === bounty.id}
                onToggle={() => setOpenId(openId === bounty.id ? null : bounty.id)}
                account={account}
                busy={busy}
                run={run}
              />
            ))}
        </div>
      </section>

      <section className="block" id="post">
        <div className="wrap">
          <h2 className="section">Sponsor</h2>
          <h3 className="big">Post a bounty</h3>
          <PostForm busy={busy} run={run} />
        </div>
      </section>

      <footer className="foot">
        <div className="wrap">
          <div>
            ANVIL · GenLayer Studio Next · chain {CHAIN_ID} · RPC {RPC_URL}
          </div>
          <div>
            Contract:{' '}
            {configured ? (
              <a href={`${EXPLORER}/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noreferrer">
                {CONTRACT_ADDRESS}
              </a>
            ) : (
              'not set'
            )}
          </div>
        </div>
      </footer>

      {toast && (
        <div className={`toast${toast.isError ? ' err' : ''}`} onClick={() => setToast(null)}>
          {toast.text}
        </div>
      )}
    </>
  );
}

function Step({ n, title, text }) {
  return (
    <div className="step">
      <div className="num">{n}</div>
      <h4>{title}</h4>
      <p>{text}</p>
    </div>
  );
}

function Bounty({ bounty, submissions, expanded, onToggle, account, busy, run }) {
  const [handle, setHandle] = useState('');
  const [repo, setRepo] = useState('');
  const [notes, setNotes] = useState('');
  const [topUp, setTopUp] = useState('');

  const isSponsor =
    account && bounty.sponsor && account.toLowerCase() === bounty.sponsor.toLowerCase();
  const isOpen = bounty.status === 'open';

  async function submitEntry() {
    if (!handle.trim() || !repo.trim()) return;
    const ok = await run('submit', [bounty.id, handle.trim(), repo.trim(), notes.trim()]);
    if (ok) {
      setHandle('');
      setRepo('');
      setNotes('');
    }
  }

  return (
    <div className={`bounty${expanded ? ' open-panel' : ''}`}>
      <div className="bounty-head" onClick={onToggle}>
        <div>
          <h4>
            #{bounty.id} — {bounty.title}
          </h4>
          <span className={`tag ${bounty.status}`}>{bounty.status}</span>{' '}
          <span className="muted" style={{ fontSize: 13 }}>
            {submissions.length} submission{submissions.length === 1 ? '' : 's'} · sponsor{' '}
            {shortAddress(bounty.sponsor)}
          </span>
        </div>
        <div className="prize">
          <span className="mono-label">Prize</span>
          <div className="amount">{formatGen(bounty.prize)} GEN</div>
        </div>
      </div>

      {expanded && (
        <div className="bounty-body">
          <div>
            <span className="mono-label">Specification</span>
            <p style={{ whiteSpace: 'pre-wrap', marginTop: 0 }}>{bounty.spec}</p>

            <span className="mono-label">Judging criteria</span>
            <p style={{ whiteSpace: 'pre-wrap', marginTop: 0 }}>{bounty.criteria}</p>

            {bounty.verdict && (
              <div className="verdict">
                <span className="mono-label">Contract verdict</span>
                {bounty.verdict}
              </div>
            )}

            {isOpen && (
              <div style={{ marginTop: 18, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  className="btn primary"
                  disabled={busy || submissions.length === 0}
                  onClick={() => run('judge', [bounty.id])}
                  title={
                    submissions.length === 0
                      ? 'Needs at least one submission'
                      : 'Ask the contract to read every repo and pick a winner'
                  }
                >
                  Run the judge
                </button>
                {isSponsor && submissions.length === 0 && (
                  <button className="btn" disabled={busy} onClick={() => run('cancel', [bounty.id])}>
                    Cancel &amp; refund
                  </button>
                )}
              </div>
            )}
          </div>

          <div>
            <span className="mono-label">Submissions</span>
            {submissions.length === 0 && <p className="muted">No entries yet.</p>}
            {submissions.map((s) => (
              <div key={s.id} className={`sub${bounty.winner === s.id ? ' winner' : ''}`}>
                <div className="top">
                  <strong>{s.handle}</strong>
                  {bounty.winner === s.id && <span className="tag settled">winner</span>}
                  {bounty.status === 'settled' && <span className="score">{s.score}/100</span>}
                </div>
                <a href={s.repo} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>
                  {s.repo}
                </a>
                {s.notes && (
                  <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>
                    {s.notes}
                  </p>
                )}
                {s.review && (
                  <p style={{ fontSize: 13, margin: '6px 0 0' }}>
                    <span className="mono-label">Judge review</span>
                    {s.review}
                  </p>
                )}
              </div>
            ))}

            {isOpen && (
              <div style={{ marginTop: 18 }}>
                <span className="mono-label">Enter this bounty</span>
                <div className="field">
                  <input
                    placeholder="Your handle"
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                  />
                </div>
                <div className="field">
                  <input
                    placeholder="https://github.com/you/your-repo"
                    value={repo}
                    onChange={(e) => setRepo(e.target.value)}
                  />
                </div>
                <div className="field">
                  <textarea
                    placeholder="One or two lines on what you built"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
                <button className="btn primary" disabled={busy} onClick={submitEntry}>
                  Submit repo
                </button>

                {isSponsor && (
                  <div style={{ marginTop: 20 }}>
                    <span className="mono-label">Top up the prize</span>
                    <div className="field">
                      <input
                        placeholder="0.5"
                        value={topUp}
                        onChange={(e) => setTopUp(e.target.value)}
                      />
                    </div>
                    <button
                      className="btn"
                      disabled={busy}
                      onClick={async () => {
                        try {
                          const value = parseGen(topUp);
                          if (value > 0n) {
                            const ok = await run('fund', [bounty.id], value);
                            if (ok) setTopUp('');
                          }
                        } catch (err) {
                          console.error(err);
                        }
                      }}
                    >
                      Add funds
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PostForm({ busy, run }) {
  const [title, setTitle] = useState('');
  const [spec, setSpec] = useState('');
  const [criteria, setCriteria] = useState('');
  const [prize, setPrize] = useState('');
  const [error, setError] = useState('');

  async function post() {
    setError('');
    if (title.trim().length < 3) return setError('Title needs at least 3 characters.');
    if (spec.trim().length < 20) return setError('Specification needs at least 20 characters.');
    if (criteria.trim().length < 10) return setError('Judging criteria needs at least 10 characters.');

    let value = 0n;
    try {
      value = parseGen(prize);
    } catch (err) {
      return setError(err.message);
    }

    const ok = await run('post_bounty', [title.trim(), spec.trim(), criteria.trim()], value);
    if (ok) {
      setTitle('');
      setSpec('');
      setCriteria('');
      setPrize('');
    }
  }

  return (
    <div className="card">
      <div className="field">
        <span className="mono-label">Title</span>
        <input
          placeholder="Build a CSV to Markdown table converter"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="field">
        <span className="mono-label">Specification — what must be built</span>
        <textarea
          placeholder="A command line tool that reads a CSV file and prints a GitHub flavoured Markdown table. Must handle quoted commas and an optional --align flag."
          value={spec}
          onChange={(e) => setSpec(e.target.value)}
        />
      </div>
      <div className="field">
        <span className="mono-label">Judging criteria — how the contract picks a winner</span>
        <textarea
          placeholder="Prefer a repo with a clear README showing example input and output, tests, and no external dependencies."
          value={criteria}
          onChange={(e) => setCriteria(e.target.value)}
        />
      </div>
      <div className="field">
        <span className="mono-label">Prize in GEN — escrowed by the contract (optional)</span>
        <input placeholder="1" value={prize} onChange={(e) => setPrize(e.target.value)} />
      </div>

      {error && (
        <p style={{ color: 'var(--ember)', fontSize: 13 }}>{error}</p>
      )}

      <button className="btn primary" disabled={busy} onClick={post}>
        Post bounty
      </button>
      <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
        The criteria are the judge&apos;s only instruction, so be specific. Anything vague gets
        judged vaguely.
      </p>
    </div>
  );
}
