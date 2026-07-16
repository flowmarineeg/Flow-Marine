'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { locationsService } from '@/services/locations.service';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
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
  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm();

  const selectedCountryId = watch('countryId');

  useEffect(() => {
    if (isEdit) {
      reset({
        name: item.name,
        code: item.code || '',
        countryId: item.countryId?._id || item.countryId || '',
        cityId: item.cityId?._id || item.cityId || '',
        portId: item.portId?._id || item.portId || '',
      });
    } else {
      reset({ name: '', code: '', countryId: '', cityId: '', portId: '' });
    }
  }, [item]);

  const { data: countries } = useQuery({
    queryKey: ['locationForm', 'countries'],
    queryFn:  () => locationsService.getCountries().then(r => r.data.data),
    enabled:  level === 'city' || level === 'port',
  });

  const { data: cities } = useQuery({
    queryKey: ['locationForm', 'cities', selectedCountryId],
    queryFn:  () => locationsService.getCities({ countryId: selectedCountryId }).then(r => r.data.data),
    enabled:  level === 'port' && !!selectedCountryId,
  });

  const { data: ports } = useQuery({
    queryKey: ['locationForm', 'ports'],
    queryFn:  () => locationsService.getPorts().then(r => r.data.data),
    enabled:  level === 'terminal',
  });

  const mutation = useMutation({
    mutationFn: (data) => isEdit ? UPDATE_FN[level](item._id, data) : CREATE_FN[level](data),
    onSuccess:  () => { toast.success(`${level.charAt(0).toUpperCase() + level.slice(1)} ${isEdit ? 'updated' : 'created'}`); onSuccess?.(); },
    onError:    (e) => toast.error(e.response?.data?.message || 'Operation failed'),
  });

  const onSubmit = (data) => {
    if (level === 'city') mutation.mutate({ name: data.name, countryId: data.countryId });
    else if (level === 'port') mutation.mutate({ name: data.name, code: data.code, cityId: data.cityId, countryId: data.countryId });
    else if (level === 'terminal') mutation.mutate({ name: data.name, portId: data.portId });
    else mutation.mutate({ name: data.name, code: data.code });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {level === 'port' && (
        <Select
          id="countryId" label="Country" required
          options={(countries || []).map(c => ({ value: c._id, label: `${c.name} (${c.code})` }))}
          error={errors.countryId?.message}
          {...register('countryId', {
            required: 'Country is required',
            onChange: () => setValue('cityId', ''),
          })}
        />
      )}

      {level === 'city' && (
        <Select
          id="countryId" label="Country" required
          options={(countries || []).map(c => ({ value: c._id, label: `${c.name} (${c.code})` }))}
          error={errors.countryId?.message}
          {...register('countryId', { required: 'Country is required' })}
        />
      )}

      {level === 'port' && (
        <Select
          id="cityId" label="City" required disabled={!selectedCountryId}
          options={(cities || []).map(c => ({ value: c._id, label: c.name }))}
          error={errors.cityId?.message}
          {...register('cityId', { required: 'City is required' })}
        />
      )}

      {level === 'terminal' && (
        <Select
          id="portId" label="Port" required
          options={(ports || []).map(p => ({ value: p._id, label: p.name }))}
          error={errors.portId?.message}
          {...register('portId', { required: 'Port is required' })}
        />
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

      {level === 'port' && (
        <Input
          id="code" label="UNLOCODE (optional)"
          placeholder="e.g. SAJED"
          error={errors.code?.message}
          {...register('code')}
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
