'use client';

import toast from 'react-hot-toast';

// Sprint 042 — shared, user-friendly error toast for every create/update/
// delete/cancel/void/import mutation. Replaces the ~30 duplicated
// `onError: (e) => toast.error(e.response?.data?.message || 'X failed')`
// call sites across every module with one implementation:
//   - a clear, bold TITLE distinct from the detail line (fixed per action
//     type, not custom per call site — simpler, one implementation)
//   - the backend's own message as the detail line underneath
//   - when the backend's express-validator `errors[]` array is present
//     (previously always discarded — only the flat top-line `message`
//     ever showed), each {field, message} pair is listed instead of the
//     generic "Validation failed" string.
const TITLES = {
  save:    "Couldn't save",
  update:  "Couldn't update",
  delete:  "Couldn't delete",
  cancel:  "Couldn't cancel",
  import:  "Couldn't import",
  void:    "Couldn't void",
  send:    "Couldn't send",
  payment: "Couldn't process payment",
  preview: "Couldn't preview",
  download: "Couldn't download",
};

export const showErrorToast = (error, actionType = 'save') => {
  const title       = TITLES[actionType] || 'Something went wrong';
  const data        = error?.response?.data;
  const detail      = data?.message || error?.message || 'Please try again.';
  const fieldErrors = Array.isArray(data?.errors) ? data.errors : null;

  toast.error(
    <div>
      <p className="font-semibold text-[13px]">{title}</p>
      {fieldErrors && fieldErrors.length > 0 ? (
        <ul className="mt-1 text-[11px] list-disc list-inside space-y-0.5">
          {fieldErrors.map((fe, i) => (
            <li key={i}>{fe.field ? `${fe.field}: ${fe.message}` : fe.message}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-0.5 text-[11px] text-gray-600">{detail}</p>
      )}
    </div>
  );
};
