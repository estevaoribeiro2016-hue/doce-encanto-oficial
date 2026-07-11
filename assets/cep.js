(function () {
  'use strict';

  const digits = value => String(value || '').replace(/\D/g, '').slice(0, 8);
  const mask = value => {
    const raw = digits(value);
    return raw.length > 5 ? raw.slice(0, 5) + '-' + raw.slice(5) : raw;
  };
  const byId = id => document.getElementById(id);

  function setStatus(message, type) {
    const el = byId('cepStatus');
    if (!el) return;
    el.textContent = message;
    el.className = 'cepStatus' + (type ? ' ' + type : '');
  }

  function fill(data) {
    const street = data.logradouro || data.street || '';
    const district = data.bairro || data.neighborhood || '';
    const city = data.localidade || data.city || '';
    const state = data.uf || data.state || '';

    if (byId('rua')) byId('rua').value = street;
    if (byId('bairro')) byId('bairro').value = district;
    if (byId('cidade')) byId('cidade').value = city;
    if (byId('estado')) byId('estado').value = state;

    ['rua', 'bairro', 'cidade', 'estado'].forEach(id => {
      const field = byId(id);
      if (field) field.dispatchEvent(new Event('input', { bubbles: true }));
    });

    if (street) {
      setStatus('Endereço preenchido automaticamente. Informe o número.', 'ok');
      setTimeout(() => byId('numero')?.focus(), 80);
    } else {
      setStatus('CEP localizado, mas sem rua cadastrada. Preencha a rua e o número.', 'ok');
      byId('rua')?.focus();
    }
  }

  async function getJson(url, timeout) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout || 10000);
    try {
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function searchCep() {
    const input = byId('cep');
    if (!input) return;
    const cep = digits(input.value);
    input.value = mask(cep);

    if (cep.length !== 8) {
      setStatus('Digite os 8 números do CEP.', 'error');
      return;
    }

    setStatus('Buscando endereço...', 'loading');
    if (byId('cepSearchBtn')) byId('cepSearchBtn').disabled = true;

    try {
      let data = null;
      try {
        const viaCep = await getJson('https://viacep.com.br/ws/' + cep + '/json/');
        if (viaCep && !viaCep.erro) data = viaCep;
      } catch (error) {
        console.warn('ViaCEP indisponível:', error);
      }

      if (!data) {
        try {
          const brasilApi = await getJson('https://brasilapi.com.br/api/cep/v1/' + cep);
          if (brasilApi && brasilApi.cep) data = brasilApi;
        } catch (error) {
          console.warn('BrasilAPI indisponível:', error);
        }
      }

      if (!data) throw new Error('CEP não encontrado');
      fill(data);
    } catch (error) {
      console.error('Falha na consulta do CEP:', error);
      setStatus('Não foi possível consultar o CEP. Clique em Buscar CEP novamente ou preencha o endereço manualmente.', 'error');
    } finally {
      if (byId('cepSearchBtn')) byId('cepSearchBtn').disabled = false;
    }
  }

  function bind() {
    const input = byId('cep');
    const button = byId('cepSearchBtn');
    if (!input || input.dataset.standaloneCep === '1') return;
    input.dataset.standaloneCep = '1';

    let timer;
    input.addEventListener('input', function () {
      const raw = digits(input.value);
      input.value = mask(raw);
      clearTimeout(timer);
      if (raw.length === 8) timer = setTimeout(searchCep, 350);
      else setStatus('Digite os 8 números do CEP.', '');
    });
    input.addEventListener('paste', () => setTimeout(searchCep, 60));
    input.addEventListener('blur', () => { if (digits(input.value).length === 8) searchCep(); });
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        searchCep();
      }
    });
    button?.addEventListener('click', searchCep);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
  window.buscarCepDoceEncanto = searchCep;
})();
