import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Account, Step1Data, Step2Data, Step3Data, Step4Data } from '../types';
import { getSettings, saveSettingsStep, submitSettings, ApiError } from '../api/client';

interface SettingsDrawerProps {
  account: Account | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({
  account,
  isOpen,
  onClose,
  onSuccess
}) => {
  const [activeStep, setActiveStep] = useState<1 | 2 | 3 | 4>(1);
  const [loadingInitial, setLoadingInitial] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');

  // Form State across the 4 steps
  const [step1, setStep1] = useState<Step1Data>({ name: '', email: '' });
  const [step2, setStep2] = useState<Step2Data>({ plan: 'basic', billing_country: 'US' });
  const [step3, setStep3] = useState<Step3Data>({ minutes_cap: '', sms_cap: '' });
  const [step4, setStep4] = useState<Step4Data>({ webhook_url: '' });

  // Rollback backup state (to revert in case of failed saves)
  const previousStateRef = useRef<{
    step1: Step1Data;
    step2: Step2Data;
    step3: Step3Data;
    step4: Step4Data;
  }>({
    step1: { name: '', email: '' },
    step2: { plan: 'basic', billing_country: 'US' },
    step3: { minutes_cap: '', sms_cap: '' },
    step4: { webhook_url: '' }
  });

  // Server-side validation errors keyed by step number
  // Essential for displaying Step 2 validation errors even when user is on Step 4
  const [stepErrors, setStepErrors] = useState<Record<number, Record<string, string>>>({});

  // Reset and load existing draft whenever drawer opens
  useEffect(() => {
    if (!isOpen || !account) return;

    setActiveStep(1);
    setStepErrors({});
    setSaveStatus('idle');
    setStatusMessage('');

    // Pre-populate with current account info
    const initialStep1: Step1Data = { name: account.name, email: account.email };
    const initialStep2: Step2Data = { plan: account.plan, billing_country: (account.country as any) || 'US' };
    const initialStep3: Step3Data = { minutes_cap: '', sms_cap: '' };
    const initialStep4: Step4Data = { webhook_url: '' };

    setStep1(initialStep1);
    setStep2(initialStep2);
    setStep3(initialStep3);
    setStep4(initialStep4);

    previousStateRef.current = {
      step1: initialStep1,
      step2: initialStep2,
      step3: initialStep3,
      step4: initialStep4
    };

    // Load server draft from GET /accounts/{id}/settings
    setLoadingInitial(true);
    getSettings(account.id)
      .then((draft) => {
        if (draft['1']) setStep1((prev) => ({ ...prev, ...draft['1'] }));
        if (draft['2']) setStep2((prev) => ({ ...prev, ...draft['2'] }));
        if (draft['3']) setStep3((prev) => ({ ...prev, ...draft['3'] }));
        if (draft['4']) setStep4((prev) => ({ ...prev, ...draft['4'] }));
      })
      .catch((err) => {
        console.warn('Could not load draft, falling back to local defaults', err);
      })
      .finally(() => setLoadingInitial(false));
  }, [isOpen, account]);

  // Handle Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // -------------------------------------------------------------
  // AUTOSAVE & DELIBERATE TRAP 2 HANDLER
  // -------------------------------------------------------------
  const saveCurrentStep = useCallback(
    async (stepToSave: 1 | 2 | 3 | 4) => {
      if (!account) return true;

      setSaveStatus('saving');
      setStatusMessage(`Autosaving Step ${stepToSave}...`);

      let dataToSave: Record<string, any> = {};
      if (stepToSave === 1) dataToSave = step1;
      else if (stepToSave === 2) dataToSave = step2;
      else if (stepToSave === 3) {
        dataToSave = {
          minutes_cap: step3.minutes_cap !== '' ? Number(step3.minutes_cap) : undefined,
          sms_cap: step3.sms_cap !== '' ? Number(step3.sms_cap) : undefined
        };
      } else if (stepToSave === 4) dataToSave = step4;

      try {
        await saveSettingsStep(account.id, stepToSave, dataToSave);

        // Update rollback snapshot on success
        if (stepToSave === 1) previousStateRef.current.step1 = { ...step1 };
        else if (stepToSave === 2) previousStateRef.current.step2 = { ...step2 };
        else if (stepToSave === 3) previousStateRef.current.step3 = { ...step3 };
        else if (stepToSave === 4) previousStateRef.current.step4 = { ...step4 };

        // Clear error for this step if it resolved
        setStepErrors((prev) => {
          const updated = { ...prev };
          delete updated[stepToSave];
          return updated;
        });

        setSaveStatus('saved');
        setStatusMessage('Draft autosaved');
        return true;
      } catch (err: any) {
        setSaveStatus('error');

        if (err instanceof ApiError && err.status === 422) {
          // Spec Trap 2: Error belongs to Step 2 even if triggered on Step 4!
          const targetStep = err.step || stepToSave;
          const errors = err.fieldErrors || { general: err.message };

          setStepErrors((prev) => ({
            ...prev,
            [targetStep]: errors
          }));

          setStatusMessage(`Server validation error on Step ${targetStep}`);
        } else {
          // Rollback to clean previous state on save failure
          setStatusMessage(err.message || 'Save failed. Rolling back changes.');
          if (stepToSave === 1) setStep1(previousStateRef.current.step1);
          else if (stepToSave === 2) setStep2(previousStateRef.current.step2);
          else if (stepToSave === 3) setStep3(previousStateRef.current.step3);
          else if (stepToSave === 4) setStep4(previousStateRef.current.step4);
        }
        return false;
      }
    },
    [account, step1, step2, step3, step4]
  );

  const handleNextStep = async () => {
    await saveCurrentStep(activeStep);
    // Allow navigation even if server gave trap validation error, so user can inspect it
    if (activeStep < 4) {
      setActiveStep((prev) => (prev + 1) as any);
    }
  };

  const handlePrevStep = async () => {
    await saveCurrentStep(activeStep);
    if (activeStep > 1) {
      setActiveStep((prev) => (prev - 1) as any);
    }
  };

  const handleFinalSubmit = async () => {
    if (!account) return;
    setIsSubmitting(true);
    setStatusMessage('Finalizing settings...');

    try {
      // First ensure step 4 is saved
      await saveCurrentStep(4);

      // Check if there are outstanding step errors (like Step 2 trap)
      if (Object.keys(stepErrors).length > 0) {
        setIsSubmitting(false);
        setSaveStatus('error');
        setStatusMessage('Please resolve the validation issue on Step 2 before submitting.');
        setActiveStep(2);
        return;
      }

      await submitSettings(account.id);
      setSaveStatus('saved');
      setStatusMessage('Settings successfully submitted!');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 800);
    } catch (err: any) {
      setSaveStatus('error');
      setStatusMessage(err.message || 'Failed to finalize settings.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !account) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop with transition */}
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-0 sm:pl-10">
        {/* Drawer Panel (Usable at 375px via w-screen max-w-md) */}
        <div className="w-screen max-w-md bg-white shadow-2xl flex flex-col justify-between border-l border-slate-200">
          
          {/* Header */}
          <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">Account Settings</h2>
                <span className="text-xs font-mono bg-slate-200/80 px-2 py-0.5 rounded text-slate-700">
                  #{account.id}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{account.company} · {account.name}</p>
            </div>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-900"
              aria-label="Close settings drawer"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Autosave Status Banner */}
          <div className="px-5 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              {saveStatus === 'saving' && (
                <span className="flex items-center gap-1.5 text-slate-500 font-medium">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                  Saving draft...
                </span>
              )}
              {saveStatus === 'saved' && (
                <span className="flex items-center gap-1.5 text-emerald-600 font-medium">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                  </svg>
                  Draft autosaved
                </span>
              )}
              {saveStatus === 'error' && (
                <span className="text-rose-600 font-medium truncate max-w-[280px]">
                  {statusMessage}
                </span>
              )}
              {saveStatus === 'idle' && (
                <span className="text-slate-400">Autosaves drafts on step progression</span>
              )}
            </div>
            <span className="text-[11px] text-slate-400 font-medium">Step {activeStep} of 4</span>
          </div>

          {/* 4-Step Navigation Tabs */}
          <div className="grid grid-cols-4 border-b border-slate-200 text-xs font-semibold text-center bg-white">
            {[
              { num: 1, title: 'Profile' },
              { num: 2, title: 'Billing' },
              { num: 3, title: 'Caps' },
              { num: 4, title: 'Webhook' }
            ].map((step) => {
              const hasError = Boolean(stepErrors[step.num]);
              const isActive = activeStep === step.num;
              return (
                <button
                  key={step.num}
                  onClick={async () => {
                    await saveCurrentStep(activeStep);
                    setActiveStep(step.num as any);
                  }}
                  className={`py-3 relative flex flex-col items-center justify-center transition-colors focus:outline-none ${
                    isActive
                      ? 'text-slate-900 border-b-2 border-slate-900 font-bold'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <span className="flex items-center gap-1">
                    <span>{step.title}</span>
                    {hasError && (
                      <span
                        className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"
                        title="Validation issue on this step"
                      />
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Form Content Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {loadingInitial ? (
              <div className="py-12 text-center text-xs text-slate-400">Loading existing draft...</div>
            ) : (
              <>
                {/* ------------------------------------------------------------- */}
                {/* STEP 1: IDENTITY */}
                {/* ------------------------------------------------------------- */}
                {activeStep === 1 && (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 mb-0.5">Account Identity</h3>
                      <p className="text-xs text-slate-500">Provide the contact details for this client.</p>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Full Name <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={step1.name}
                        onChange={(e) => setStep1({ ...step1, name: e.target.value })}
                        placeholder="John Doe"
                        className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Email Address <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="email"
                        value={step1.email}
                        onChange={(e) => setStep1({ ...step1, email: e.target.value })}
                        placeholder="john@company.com"
                        className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                        required
                      />
                    </div>
                  </div>
                )}

                {/* ------------------------------------------------------------- */}
                {/* STEP 2: PLAN & BILLING (The Deliberate Trap 2 Target!) */}
                {/* ------------------------------------------------------------- */}
                {activeStep === 2 && (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 mb-0.5">Plan & Billing Country</h3>
                      <p className="text-xs text-slate-500">Select tier and tax jurisdiction.</p>
                    </div>

                    {/* Trap 2 Warning Banner if triggered by server */}
                    {stepErrors[2] && (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 space-y-1">
                        <div className="font-semibold flex items-center gap-1.5 text-amber-900">
                          <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          Server Validation Alert
                        </div>
                        <p>
                          {stepErrors[2].billing_country || 'Billing country validation required by server.'}
                        </p>
                        <p className="text-[11px] text-amber-700">
                          Please re-select or confirm your billing country below, then click Next to re-save.
                        </p>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Subscription Plan <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={step2.plan}
                        onChange={(e) => setStep2({ ...step2, plan: e.target.value as any })}
                        className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                      >
                        <option value="basic">Basic Tier</option>
                        <option value="pro">Pro Tier</option>
                        <option value="enterprise">Enterprise Tier</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Billing Country <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={step2.billing_country}
                        onChange={(e) => {
                          setStep2({ ...step2, billing_country: e.target.value as any });
                          // Clear Step 2 error when user interacts
                          setStepErrors((prev) => {
                            const updated = { ...prev };
                            delete updated[2];
                            return updated;
                          });
                        }}
                        className={`w-full px-3 py-2 text-sm bg-slate-50 border rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 ${
                          stepErrors[2]?.billing_country ? 'border-rose-400 ring-1 ring-rose-300' : 'border-slate-200'
                        }`}
                      >
                        <option value="US">United States (US)</option>
                        <option value="IN">India (IN)</option>
                        <option value="GB">United Kingdom (GB)</option>
                        <option value="CA">Canada (CA)</option>
                        <option value="AU">Australia (AU)</option>
                      </select>
                      {stepErrors[2]?.billing_country && (
                        <p className="text-xs text-rose-600 mt-1 font-medium">
                          {stepErrors[2].billing_country}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* ------------------------------------------------------------- */}
                {/* STEP 3: THRESHOLDS & CAPS */}
                {/* ------------------------------------------------------------- */}
                {activeStep === 3 && (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 mb-0.5">Usage Thresholds</h3>
                      <p className="text-xs text-slate-500">Optional monthly limits on minutes and SMS.</p>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Minutes Cap (Monthly)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={step3.minutes_cap}
                        onChange={(e) => setStep3({ ...step3, minutes_cap: e.target.value === '' ? '' : Number(e.target.value) })}
                        placeholder="e.g. 5000"
                        className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        SMS Cap (Monthly)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={step3.sms_cap}
                        onChange={(e) => setStep3({ ...step3, sms_cap: e.target.value === '' ? '' : Number(e.target.value) })}
                        placeholder="e.g. 1000"
                        className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                      />
                    </div>
                  </div>
                )}

                {/* ------------------------------------------------------------- */}
                {/* STEP 4: WEBHOOK URL & FINALIZE */}
                {/* ------------------------------------------------------------- */}
                {activeStep === 4 && (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 mb-0.5">Integrations</h3>
                      <p className="text-xs text-slate-500">Configure real-time event webhooks for telephony logs.</p>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Webhook Destination URL
                      </label>
                      <input
                        type="url"
                        value={step4.webhook_url}
                        onChange={(e) => setStep4({ ...step4, webhook_url: e.target.value })}
                        placeholder="https://api.yourdomain.com/webhooks"
                        className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                      />
                      <p className="text-[11px] text-slate-400 mt-1">Must start with http:// or https://</p>
                    </div>

                    {/* Notice if Step 2 has an unresolved error */}
                    {stepErrors[2] && (
                      <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
                        <strong className="block font-semibold">⚠️ Attention: Step 2 requires confirmation</strong>
                        The server flagged billing country validation. You can jump back to Step 2 to review, or proceed to submit.
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer Controls */}
          <div className="p-4 md:p-5 border-t border-slate-100 bg-slate-50/75 flex items-center justify-between gap-3">
            <button
              onClick={handlePrevStep}
              disabled={activeStep === 1 || loadingInitial}
              className="px-4 py-2 border border-slate-200 text-xs font-semibold rounded-xl text-slate-700 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              Previous
            </button>

            {activeStep < 4 ? (
              <button
                onClick={handleNextStep}
                disabled={loadingInitial}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 active:scale-95"
              >
                Save & Continue →
              </button>
            ) : (
              <button
                onClick={handleFinalSubmit}
                disabled={isSubmitting || loadingInitial}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2 active:scale-95"
              >
                {isSubmitting ? 'Finalizing...' : 'Submit All Settings ✓'}
              </button>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};
