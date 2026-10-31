<?php
// Cria o pagamento da compra no Mercado Pago (Checkout Pro) e devolve o link da página segura de pagamento.
// Roda no HostGator, no mesmo endereço do site: https://bethmodas.com/api/pagamento.php
//
// A chave secreta do Mercado Pago (Access Token) fica em api/config-segredo.php. Esse arquivo é criado
// só na publicação (GitHub Actions, segredo MP_ACCESS_TOKEN): não vai para o GitHub, e o .htaccess
// bloqueia o acesso direto a ele.
//
// GET  → {"ok": true, "configurado": bool, "teste": bool}  (a finalização usa para decidir o botão)
// POST → {"url": "...", "pedido": "BM..."} ou {"erro": "..."}
//
// Para testes locais, também lê variáveis de ambiente: MP_ACCESS_TOKEN, SITE_URL (padrão https://bethmodas.com),
// ORIGENS (sites que podem chamar, separados por vírgula), MP_API_URL (padrão https://api.mercadopago.com)
// e MP_CACHE_DIR (pasta do cache dos meios de pagamento).

// um aviso do PHP no meio da resposta estragaria o JSON: avisos vão só para o log do servidor
ini_set('display_errors', '0');

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

const METODOS = ['pix' => 'Pix', 'boleto' => 'Boleto', 'credito' => 'Cartão de crédito', 'debito' => 'Cartão de débito'];

function ambiente($nome, $padrao)
{
    $v = getenv($nome);
    return ($v === false || $v === '') ? $padrao : $v;
}

$arquivoSegredo = __DIR__ . '/config-segredo.php';
$config = is_file($arquivoSegredo) ? include $arquivoSegredo : [];
if (!is_array($config)) {
    $config = [];
}
$TOKEN = isset($config['token']) && is_string($config['token']) && $config['token'] !== ''
    ? $config['token'] : ambiente('MP_ACCESS_TOKEN', '');
$API = rtrim(ambiente('MP_API_URL', 'https://api.mercadopago.com'), '/');
$SITE = rtrim(ambiente('SITE_URL', 'https://bethmodas.com'), '/');
$ORIGENS = array_values(array_filter(array_map('trim', explode(',', ambiente('ORIGENS', 'https://bethmodas.com,https://www.bethmodas.com')))));
$CACHE = ambiente('MP_CACHE_DIR', sys_get_temp_dir());

class ErroPedido extends Exception
{
}

function responder($status, $dados)
{
    http_response_code($status);
    echo json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

// corta em caracteres (não em bytes), sem depender da extensão mbstring
function cortar($texto, $max)
{
    return preg_match('/^.{0,' . (int) $max . '}/us', $texto, $m) ? $m[0] : '';
}

function texto($valor, $max)
{
    if (!is_string($valor)) {
        return '';
    }
    $limpo = preg_replace('/\s+/u', ' ', trim($valor));
    return $limpo === null ? '' : cortar(trim($limpo), $max);
}

function digitos($valor)
{
    return is_scalar($valor) ? preg_replace('/\D/', '', (string) $valor) : '';
}

function ehLista($valor)
{
    return is_array($valor) && ($valor === [] || array_keys($valor) === range(0, count($valor) - 1));
}

function reais($valor)
{
    return 'R$ ' . number_format($valor, 2, ',', '.');
}

function catalogo()
{
    $bruto = @file_get_contents(__DIR__ . '/../dados/produtos.json');
    $dados = $bruto === false ? null : json_decode($bruto, true);
    if (!is_array($dados) || !isset($dados['produtos']) || !is_array($dados['produtos'])) {
        throw new RuntimeException('não consegui ler dados/produtos.json');
    }
    $mapa = [];
    foreach ($dados['produtos'] as $p) {
        $mapa[(string) $p['ref']] = $p;
    }
    return $mapa;
}

function validar($corpo, $catalogo)
{
    if (!is_array($corpo)) {
        throw new ErroPedido('Pedido inválido.');
    }

    $lista = isset($corpo['itens']) && ehLista($corpo['itens']) ? $corpo['itens'] : [];
    if (!$lista) {
        throw new ErroPedido('Seu carrinho está vazio.');
    }
    if (count($lista) > 30) {
        throw new ErroPedido('Pedido com itens demais.');
    }
    $itens = [];
    foreach ($lista as $i) {
        $ref = is_array($i) && isset($i['ref']) && is_string($i['ref']) ? $i['ref'] : null;
        if ($ref === null || !array_key_exists($ref, $catalogo)) {
            throw new ErroPedido('Um dos produtos do carrinho não está mais disponível. Atualize o carrinho.');
        }
        $p = $catalogo[$ref];
        $qtd = isset($i['qtd']) ? $i['qtd'] : null;
        if (is_float($qtd) && floor($qtd) == $qtd) {
            $qtd = (int) $qtd;
        } elseif (is_string($qtd) && ctype_digit($qtd)) {
            $qtd = (int) $qtd;
        }
        if (!is_int($qtd) || $qtd < 1 || $qtd > 20) {
            throw new ErroPedido('Quantidade inválida.');
        }
        $tamanho = isset($i['tamanho']) && is_string($i['tamanho']) ? $i['tamanho'] : '';
        $tamanhos = isset($p['tamanhos']) && is_array($p['tamanhos']) ? $p['tamanhos'] : [];
        if ($tamanhos ? !in_array($tamanho, $tamanhos, true) : $tamanho !== '') {
            throw new ErroPedido('Escolha um tamanho válido para ' . $p['nome'] . '.');
        }
        // o preço sempre vem do catálogo da loja, nunca do navegador
        $itens[] = ['ref' => $ref, 'nome' => (string) $p['nome'], 'foto' => (string) $p['foto'],
            'preco' => (float) $p['preco'], 'tamanho' => $tamanho, 'qtd' => $qtd];
    }

    $c = isset($corpo['cliente']) && is_array($corpo['cliente']) ? $corpo['cliente'] : [];
    $cliente = [
        'nome' => texto(isset($c['nome']) ? $c['nome'] : null, 80),
        'whatsapp' => digitos(isset($c['whatsapp']) ? $c['whatsapp'] : ''),
        'email' => texto(isset($c['email']) ? $c['email'] : null, 120),
    ];
    if (preg_match_all('/./us', $cliente['nome']) < 3) {
        throw new ErroPedido('Escreva seu nome completo.');
    }
    if (strlen($cliente['whatsapp']) < 10 || strlen($cliente['whatsapp']) > 13) {
        throw new ErroPedido('Confira o número de WhatsApp.');
    }
    if (!preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u', $cliente['email'])) {
        throw new ErroPedido('Confira o e-mail.');
    }

    $e = isset($corpo['entrega']) && is_array($corpo['entrega']) ? $corpo['entrega'] : [];
    $entrega = ['tipo' => (isset($e['tipo']) && $e['tipo'] === 'entrega') ? 'entrega' : 'retirada'];
    if ($entrega['tipo'] === 'entrega') {
        $campo = function ($nome, $max) use ($e) {
            return texto(isset($e[$nome]) ? $e[$nome] : null, $max);
        };
        $entrega += [
            'cep' => digitos(isset($e['cep']) ? $e['cep'] : ''), 'rua' => $campo('rua', 120), 'numero' => $campo('numero', 10),
            'complemento' => $campo('complemento', 60), 'bairro' => $campo('bairro', 60), 'cidade' => $campo('cidade', 60),
        ];
        if (strlen($entrega['cep']) !== 8 || $entrega['rua'] === '' || $entrega['numero'] === ''
            || $entrega['bairro'] === '' || $entrega['cidade'] === '') {
            throw new ErroPedido('Confira o endereço de entrega.');
        }
    }

    $metodo = isset($corpo['metodo']) ? $corpo['metodo'] : null;
    if (!is_string($metodo) || !array_key_exists($metodo, METODOS)) {
        throw new ErroPedido('Escolha a forma de pagamento.');
    }
    return ['itens' => $itens, 'cliente' => $cliente, 'entrega' => $entrega, 'metodo' => $metodo];
}

function uuid()
{
    $b = random_bytes(16);
    $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
    $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
}

// Chamada à API do Mercado Pago. Devolve [status HTTP, resposta decodificada].
function requisicao($metodo, $url, $token, $corpo = null)
{
    $cabecalhos = ['Authorization: Bearer ' . $token, 'Accept: application/json'];
    $json = null;
    if ($corpo !== null) {
        $json = json_encode($corpo, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $cabecalhos[] = 'Content-Type: application/json';
        $cabecalhos[] = 'X-Idempotency-Key: ' . uuid();
    }
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST => $metodo,
            CURLOPT_HTTPHEADER => $cabecalhos,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_TIMEOUT => 20,
        ]);
        if ($json !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $json);
        }
        $resposta = curl_exec($ch);
        if ($resposta === false) {
            throw new RuntimeException('cURL: ' . curl_error($ch));
        }
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    } else {
        $contexto = stream_context_create(['http' => [
            'method' => $metodo, 'header' => implode("\r\n", $cabecalhos), 'content' => (string) $json,
            'timeout' => 20, 'ignore_errors' => true,
        ]]);
        $resposta = @file_get_contents($url, false, $contexto);
        if ($resposta === false) {
            throw new RuntimeException('sem resposta de ' . $url);
        }
        $linhas = function_exists('http_get_last_response_headers') ? http_get_last_response_headers() : $http_response_header;
        $status = 0;
        foreach ((array) $linhas as $linha) {
            if (preg_match('#^HTTP/\S+\s+(\d{3})#', $linha, $m)) {
                $status = (int) $m[1];
            }
        }
    }
    return [$status, json_decode((string) $resposta, true)];
}

// Lista de meios de pagamento da conta, guardada por 10 minutos.
function meiosDePagamento($api, $token, $pasta)
{
    $arquivo = rtrim($pasta, '/\\') . '/beth-mp-meios-' . substr(hash('sha256', $token), 0, 16) . '.json';
    if (is_file($arquivo) && time() - filemtime($arquivo) < 600) {
        $lista = json_decode((string) @file_get_contents($arquivo), true);
        if (ehLista($lista) && $lista) {
            return $lista;
        }
    }
    list($status, $lista) = requisicao('GET', $api . '/v1/payment_methods', $token);
    if ($status !== 200 || !ehLista($lista)) {
        throw new RuntimeException('payment_methods respondeu ' . $status);
    }
    @file_put_contents($arquivo, json_encode($lista), LOCK_EX);
    return $lista;
}

// Qual meio de pagamento do Mercado Pago corresponde a cada opção do site.
// "ticket" é o boleto; "pix" é o identificador do Pix.
function corresponde($metodo, $m)
{
    $id = isset($m['id']) ? $m['id'] : '';
    $tipo = isset($m['payment_type_id']) ? $m['payment_type_id'] : '';
    switch ($metodo) {
        case 'pix':
            return $id === 'pix';
        case 'boleto':
            return $tipo === 'ticket';
        case 'credito':
            return $tipo === 'credit_card';
        case 'debito':
            return $tipo === 'debit_card';
    }
    return false;
}

// Deixa disponível só a forma de pagamento escolhida no site. Sem a lista, o checkout mostra todas.
function restricoes($api, $token, $pasta, $metodo)
{
    try {
        $lista = meiosDePagamento($api, $token, $pasta);
    } catch (Throwable $erro) {
        error_log('Beth Modas: não consegui consultar os meios de pagamento: ' . $erro->getMessage());
        return null;
    }
    $permitidos = [];
    foreach ($lista as $m) {
        if (is_array($m) && corresponde($metodo, $m) && isset($m['payment_type_id'])) {
            $permitidos[$m['payment_type_id']] = true;
        }
    }
    if (!$permitidos) {
        error_log('Beth Modas: nenhum meio de pagamento corresponde a "' . $metodo . '"; o checkout mostrará todos.');
        return null;
    }
    $tipos = [];
    $metodos = [];
    foreach ($lista as $m) {
        $tipo = is_array($m) && isset($m['payment_type_id']) ? (string) $m['payment_type_id'] : '';
        // "dinheiro em conta" do Mercado Pago não pode ser excluído (regra do Mercado Pago)
        if ($tipo === '' || $tipo === 'account_money') {
            continue;
        }
        if (!isset($permitidos[$tipo])) {
            $tipos[$tipo] = true;
        } elseif (!corresponde($metodo, $m) && isset($m['id'])) {
            // dentro do mesmo tipo, tira o que não é a escolha (ex.: outros meios além do Pix)
            $metodos[(string) $m['id']] = true;
        }
    }
    $ids = function ($mapa) {
        return array_map(function ($id) {
            return ['id' => (string) $id];
        }, array_keys($mapa));
    };
    return ['excluded_payment_types' => $ids($tipos), 'excluded_payment_methods' => $ids($metodos)];
}

function numeroDoPedido()
{
    $letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    $sufixo = '';
    for ($k = 0; $k < 4; $k++) {
        $sufixo .= $letras[random_int(0, 35)];
    }
    return 'BM' . gmdate('ymd') . '-' . $sufixo;
}

function montarPreferencia($pedido, $numero, $pagamento, $site)
{
    $itens = $pedido['itens'];
    $cliente = $pedido['cliente'];
    $entrega = $pedido['entrega'];
    $partes = explode(' ', $cliente['nome']);
    $nome = array_shift($partes);
    $fone = strlen($cliente['whatsapp']) > 11 ? substr($cliente['whatsapp'], -11) : $cliente['whatsapp'];
    $endereco = $entrega['tipo'] === 'entrega'
        ? $entrega['rua'] . ', ' . $entrega['numero'] . ($entrega['complemento'] !== '' ? ' - ' . $entrega['complemento'] : '')
            . ', ' . $entrega['bairro'] . ', ' . $entrega['cidade'] . ', CEP ' . $entrega['cep']
        : 'Retirada na loja';
    $resumo = implode('; ', array_map(function ($i) {
        return $i['qtd'] . 'x ' . $i['nome'] . ($i['tamanho'] !== '' ? ' (' . $i['tamanho'] . ')' : '');
    }, $itens));
    $total = 0.0;
    foreach ($itens as $i) {
        $total += $i['preco'] * $i['qtd'];
    }

    $preferencia = [
        'items' => array_map(function ($i) use ($site) {
            return [
                'id' => $i['ref'],
                'title' => $i['tamanho'] !== '' ? $i['nome'] . ' - tamanho ' . $i['tamanho'] : $i['nome'],
                'quantity' => $i['qtd'],
                'unit_price' => $i['preco'],
                'currency_id' => 'BRL',
                'picture_url' => $site . '/assets/img/produtos/' . $i['foto'],
            ];
        }, $itens),
        'payer' => [
            'name' => $nome,
            'surname' => implode(' ', $partes),
            'email' => $cliente['email'],
            'phone' => ['area_code' => substr($fone, 0, 2), 'number' => substr($fone, 2)],
        ],
        'back_urls' => [
            'success' => $site . '/pedido.html?resultado=aprovado',
            'pending' => $site . '/pedido.html?resultado=pendente',
            'failure' => $site . '/pedido.html?resultado=recusado',
        ],
        'auto_return' => 'approved',
        'external_reference' => $numero,
        'statement_descriptor' => 'BETHMODAS',
        'additional_info' => cortar('Pedido ' . $numero . '. ' . $resumo . '. Entrega: ' . $endereco . '. WhatsApp: ' . $cliente['whatsapp'] . '.', 600),
        'metadata' => [
            'pedido' => $numero,
            'forma_de_pagamento' => METODOS[$pedido['metodo']],
            'cliente_nome' => $cliente['nome'],
            'cliente_whatsapp' => $cliente['whatsapp'],
            'cliente_email' => $cliente['email'],
            'entrega' => $endereco,
            'itens' => $resumo,
            'total' => reais($total),
        ],
    ];
    if ($pagamento !== null) {
        $preferencia['payment_methods'] = $pagamento;
    }
    return $preferencia;
}

// ---------------------------------------------------------------- atendimento da chamada
$origem = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
if ($origem !== '' && !in_array($origem, $ORIGENS, true)) {
    responder(403, ['erro' => 'Origem não permitida.']);
}

$metodoHttp = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET';
if ($metodoHttp === 'GET') {
    // a chave de teste começa com TEST-; a de produção, com APP_USR-
    responder(200, ['ok' => true, 'configurado' => $TOKEN !== '', 'teste' => strpos($TOKEN, 'TEST-') === 0]);
}
if ($metodoHttp !== 'POST') {
    responder(405, ['erro' => 'Método não permitido.']);
}
if ($TOKEN === '') {
    responder(503, ['erro' => 'O pagamento online ainda não foi configurado.']);
}

$bruto = (string) file_get_contents('php://input');
if (strlen($bruto) > 20000) {
    responder(400, ['erro' => 'Pedido inválido.']);
}
try {
    $pedido = validar(json_decode($bruto, true), catalogo());
} catch (ErroPedido $erro) {
    responder(400, ['erro' => $erro->getMessage()]);
} catch (Throwable $erro) {
    error_log('Beth Modas: pedido não validado: ' . $erro->getMessage());
    responder(400, ['erro' => 'Pedido inválido.']);
}

$numero = numeroDoPedido();
$preferencia = montarPreferencia($pedido, $numero, restricoes($API, $TOKEN, $CACHE, $pedido['metodo']), $SITE);

try {
    list($status, $dados) = requisicao('POST', $API . '/checkout/preferences', $TOKEN, $preferencia);
} catch (Throwable $erro) {
    error_log('Beth Modas: falha ao falar com o Mercado Pago: ' . $erro->getMessage());
    responder(502, ['erro' => 'Não foi possível abrir o pagamento agora.']);
}
if ($status < 200 || $status >= 300 || !is_array($dados)) {
    error_log('Beth Modas: o Mercado Pago recusou a preferência: ' . $status . ' ' . substr((string) json_encode($dados), 0, 800));
    responder(502, ['erro' => 'Não foi possível abrir o pagamento agora.']);
}

// a chave de teste usa o checkout de testes
$url = strpos($TOKEN, 'TEST-') === 0 && !empty($dados['sandbox_init_point'])
    ? $dados['sandbox_init_point'] : (isset($dados['init_point']) ? $dados['init_point'] : '');
if (!is_string($url) || $url === '') {
    error_log('Beth Modas: resposta do Mercado Pago sem link de pagamento: ' . substr((string) json_encode($dados), 0, 800));
    responder(502, ['erro' => 'Não foi possível abrir o pagamento agora.']);
}
responder(200, ['url' => $url, 'pedido' => $numero]);
