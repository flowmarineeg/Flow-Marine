'use client';

import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { showErrorToast } from '@/utils/errorToast';
import { locationsService } from '@/services/locations.service';
import Input from '@/components/ui/Input';
import LocationPicker from '@/components/forms/LocationPicker';
import Button from '@/components/ui/Button';

const CREATE_FN = {
  country:  locationsService.createCountry,
  city:     locationsService.createCity,
  port:     locationsService.createPort,
  terminal: locationsService.createTerminal,
};
const UPDATE_FN = {
  country:  locationsService.updateCountry,
  city:     locationsService.updateCity,
  port:     locationsService.updatePort,
  terminal: locationsService.updateTerminal,
};

export default function LocationForm({ level, item = null, onSuccess, onCancel }) {
  const isEdit = !!item;
  const { register, handleSubmit, watch, setValue, reset, control, formState: { errors } } = useForm();

  const selectedCountryId = watch('countryId');

  useEffect(() => {
    if (isEdit) {
      reset({
        name: item.name,
        code: item.code || '',
        localCurrency: item.localCurrency || '',
        countryId: item.countryId?._id || item.countryId || '',
        cityId: item.cityId?._id || item.cityId || '',
        portId: item.portId?._id || item.portId || '',
      });
    } else {
      reset({ name: '', code: '', localCurrency: '', countryId: '', cityId: '', portId: '' });
    }
  }, [item]);

  const mutation = useMutation({
    mutationFn: (data) => isEdit ? UPDATE_FN[level](item._id, data) : CREATE_FN[level](data),
    onSuccess:  () => { toast.success(`${level.charAt(0).toUpperCase() + level.slice(1)} ${isEdit ? 'updated' : 'created'}`); onSuccess?.(); },
    onError:    (e) => showErrorToast(e, isEdit ? 'update' : 'save'),
  });

  const onSubmit = (data) => {
    if (level === 'city') mutation.mutate({ name: data.name, countryId: data.countryId });
    else if (level === 'port') mutation.mutate({ name: data.name, code: data.code, cityId: data.cityId, countryId: data.countryId });
    else if (level === 'terminal') mutation.mutate({ name: data.name, portId: data.portId });
    else mutation.mutate({ name: data.name, code: data.code, localCurrency: data.localCurrency?.trim() ? data.localCurrency.trim().toUpperCase() : null });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {level === 'port' && (
        <Controller name="countryId" control={control} rules={{ required: 'Country is required' }}
          render={({ field }) => (
            <LocationPicker id="countryId" level="country" label="Country" required value={field.value || ''}
              onChange={(v) => { field.onChange(v); setValue('cityId', ''); }}
              error={errors.countryId?.message} placeholder="Select country…" searchPlaceholder="Search country…" />
          )} />
      )}

      {level === 'city' && (
        <Controller name="countryId" control={control} rules={{ required: 'Country is required' }}
          render={({ field }) => (
            <LocationPicker id="countryId" level="country" label="Country" required value={field.value || ''}
              onChange={(v) => { field.onChange(v); }}
              error={errors.countryId?.message} placeholder="Select country…" searchPlaceholder="Search country…" />
          )} />
      )}

      {level === 'port' && (
        <Controller name="cityId" control={control} rules={{ required: 'City is required' }}
          render={({ field }) => (
            <LocationPicker id="cityId" level="city" label="City" required value={field.value || ''}
              parent={{ countryId: selectedCountryId }} disabled={!selectedCountryId}
              onChange={(v) => { field.onChange(v); }}
              error={errors.cityId?.message} placeholder="Select city…" searchPlaceholder="Search city…" />
          )} />
      )}

      {level === 'terminal' && (
        <Controller name="portId" control={control} rules={{ required: 'Port is required' }}
          render={({ field }) => (
            <LocationPicker id="portId" level="port" label="Port" required value={field.value || ''}
              onChange={(v) => { field.onChange(v); }}
              error={errors.portId?.message} placeholder="Select port…" searchPlaceholder="Search port…" />
          )} />
      )}

      <Input
        id="name" label="Name" required
        placeholder={`e.g. ${{ country: 'Saudi Arabia', city: 'Jeddah', port: 'Jeddah Islamic Port', terminal: 'North Terminal' }[level]}`}
        error={errors.name?.message}
        {...register('name', { required: 'Name is required' })}
      />

      {level === 'country' && (
        <Input
          id="code" label="Country Code (ISO 2-letter)" required
          placeholder="e.g. SA" maxLength={2}
          style={{ textTransform: 'uppercase' }}
          error={errors.code?.message}
          {...register('code', {
            required: 'Code is required',
            pattern: { value: /^[A-Za-z]{2}$/, message: 'Must be exactly 2 letters' },
          })}
        />
      )}

      {level === 'country' && (
        <Input
          id="localCurrency" label="Local Currency (ISO 4217)"
          placeholder="e.g. SAR" maxLength={3}
          style={{ textTransform: 'uppercase' }}
          error={errors.localCurrency?.message}
          {...register('localCurrency', { pattern: { value: /^[A-Za-z]{3}$/, message: 'Must be a 3-letter currency code' } })}
        />
      )}

      {level === 'port' && (
        <Input
          id="code" label="Port Code (UN/LOCODE)"
          placeholder="e.g. SAJED" maxLength={5}
          style={{ textTransform: 'uppercase' }}
          error={errors.code?.message}
          {...register('code', { pattern: { value: /^[A-Za-z]{2}[A-Za-z0-9]{3}$/, message: '2-letter country + 3 letters/digits, e.g. SAJED' } })}
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="submit" loading={mutation.isPending}>
          {isEdit ? 'Save Changes' : 'Create'}
        </Button>
      </div>
    </form>
  );
}
