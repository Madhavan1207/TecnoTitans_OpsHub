import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { http, errMsg } from '../lib/api.js';
import { themeVars } from '../lib/theme.js';
import { DynamicForm, buildPayload, initialValues, serverErrors } from '../components/DynamicForm.jsx';
import { Logo, Spinner, useAsync, Empty } from '../components/ui.jsx';
import { CheckCircle2 } from '../lib/icons.jsx';

/** Role: Public. No login. Only exists when the site owner enables "public intake" in the Request module. */
export default function PublicSubmit() {
  const { slug } = useParams();
  const meta = useAsync(() => http.get(`/public/sites/${slug}`).then((r) => r.data), [slug]);
  const form = useAsync(() => http.get(`/${slug}/public/form`).then((r) => r.data), [slug]);
  const [v, setV] = useState(null);
  const [errs, setErrs] = useState({});
  const [done, setDone] = useState(null);
  const [msg, setMsg] = useState('');
  if (meta.loading || form.loading) return <Spinner />;
  if (meta.error || form.error) return <div className="min-h-screen grid place-items-center"><Empty title="Not available" hint="This site does not accept public requests." /></div>;
  const fields = form.data.fields;
  const value = v || initialValues(fields);
  const submit = async () => { setErrs({}); setMsg(''); try { const { data } = await http.post(`/${slug}/public/requests`, buildPayload(fields, value)); setDone(data); } catch (e) { setErrs(serverErrors(e)); setMsg(errMsg(e)); } };
  return (
    <div className="themed min-h-screen py-10 px-4" style={themeVars(meta.data.theme)}>
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-6"><div className="font-heading text-4xl">{meta.data.name}</div><div className="text-muted">{meta.data.tagline}</div></div>
        {done ? (
          <div className="card panel-pad text-center py-10"><CheckCircle2 size={48} className="mx-auto text-ok" /><div className="font-heading text-2xl mt-3">{done.message}</div><div className="mt-2">Your reference: <b className="tag-mono">{done.label}</b></div>
            {done.sms && <div className="mt-3 text-sm text-muted">We will text you at every step. You can also check progress any time.</div>}
            <Link className="btn btn-primary mt-5" to={`/s/${slug}/track?ref=${done.label}`}>Track my request</Link></div>
        ) : (
          <div className="card p-6"><div className="font-heading text-2xl mb-4">Submit a request</div>
            <DynamicForm fields={fields} value={value} onChange={setV} errors={errs} columns={1} />
            {msg && <div className="err-text mt-3">{msg}</div>}
            <button className="btn btn-primary w-full mt-5 !py-3" onClick={submit}>Send request</button></div>)}
        <div className="flex justify-center items-center gap-3 mt-8 text-xs text-muted"><Link className="underline" to={`/s/${slug}/track`}>Already submitted? Track your request</Link><span>Powered by</span><Logo height={24} /></div>
      </div>
    </div>
  );
}
