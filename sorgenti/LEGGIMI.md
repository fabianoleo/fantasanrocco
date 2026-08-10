# Sorgenti

Materiale di partenza, **non servito al browser**.

## `loghi-sponsor/`

I PNG originali dei loghi sponsor, come li mandano le attività: grandi,
pesanti, con il fondo pieno e la cornice che alcuni export si portano dietro.
Da qui si ricavano quelli che finiscono in `public/sponsor/` con:

```
node strumenti/prepara_loghi.js loghi-sponsor/nome.png:nome.png
```

Stavano dentro `public/sponsor/loghi-png/`, che è un errore per due motivi:
`public/` è servita staticamente, quindi 34 MB di file di lavoro erano
scaricabili da chiunque ne indovinasse il percorso; e finivano in ogni copia
del progetto senza che nessuna pagina li usasse.
