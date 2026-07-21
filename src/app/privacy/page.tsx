import type { Metadata } from "next";
import { LegalLayout, H } from "@/components/LegalLayout";

export const metadata: Metadata = {
  title: "Política de Privacidade · DashMonster",
  description: "Como o DashMonster coleta, usa, armazena e exclui dados.",
};

export default function PrivacyPage() {
  return (
    <LegalLayout title="Política de Privacidade" updated="17 de julho de 2026">
      <p>
        Esta Política descreve como o <strong>DashMonster</strong> (&quot;nós&quot;), operado por
        GSAStúdio, coleta, usa, armazena e exclui informações ao fornecer sua
        plataforma de análise de campanhas e CRM. Ao usar o serviço, você concorda com esta Política.
      </p>

      <H>1. Quem usa o DashMonster</H>
      <p>
        O DashMonster é uma ferramenta <strong>B2B</strong> usada por empresas e agências para
        analisar seus próprios anúncios e gerir seus próprios contatos comerciais. Não é um serviço
        dirigido ao consumidor final e não coletamos dados de crianças.
      </p>

      <H>2. Dados que coletamos</H>
      <p><strong>2.1. Da sua conta.</strong> Email e credenciais de acesso, eventos de login (data, endereço IP, dispositivo e localização aproximada) para segurança.</p>
      <p><strong>2.2. Dados da Plataforma Meta.</strong> Quando você conecta uma conta Facebook/Instagram/WhatsApp via login oficial da Meta, acessamos, conforme as permissões concedidas por você:</p>
      <ul>
        <li>métricas e relatórios de contas de anúncios (<code>ads_read</code>), gestão de negócio (<code>business_management</code>);</li>
        <li>lista de Páginas e engajamento (<code>pages_show_list</code>, <code>pages_read_engagement</code>);</li>
        <li>dados e mensagens do Instagram (<code>instagram_basic</code>, <code>instagram_manage_insights</code>, <code>instagram_manage_messages</code>);</li>
        <li>mensagens do WhatsApp Business, quando conectado por você.</li>
      </ul>
      <p><strong>2.3. Dados de contatos do seu CRM.</strong> Nome, email, telefone e histórico de conversas dos leads que você importa ou recebe — tratados por você, sob sua responsabilidade como controlador desses dados.</p>
      <p><strong>2.4. Dados do pixel de rastreamento.</strong> Nos sites onde você instala nosso pixel, capturamos eventos (visita, envio de formulário), com email/telefone (quando informados no formulário), endereço IP, agente de usuário, localização aproximada por IP e parâmetros de campanha (UTM).</p>

      <H>3. Como usamos</H>
      <p>
        Usamos os dados exclusivamente para operar o serviço que você contratou: exibir métricas,
        organizar leads, enviar mensagens que você inicia e enviar eventos de conversão à Meta
        (Conversions API) quando você configura. <strong>Não vendemos dados</strong> e não os usamos
        para publicidade própria.
      </p>

      <H>4. Compartilhamento</H>
      <p>Compartilhamos dados apenas com subprocessadores necessários à operação:</p>
      <ul>
        <li><strong>Supabase</strong> (banco de dados e autenticação);</li>
        <li><strong>Vercel</strong> (hospedagem);</li>
        <li><strong>Meta</strong> (envio de eventos de conversão e leitura de métricas, conforme sua autorização).</li>
      </ul>

      <H>5. Armazenamento e segurança</H>
      <p>
        Os dados ficam em banco com controle de acesso por linha (RLS). Tokens de acesso de terceiros
        são guardados de forma protegida no servidor e nunca expostos ao navegador. O acesso é
        restrito por autenticação e escopo de empresa.
      </p>

      <H>6. Retenção</H>
      <p>
        Mantemos os dados enquanto sua conta estiver ativa. Ao encerrar o contrato, os dados de
        negócio da sua empresa são exportáveis e podem ser excluídos mediante solicitação (ver seção
        8 e a página de <a href="/data-deletion" className="underline">Exclusão de Dados</a>).
      </p>

      <H>7. Dados recebidos da Meta (Platform Data)</H>
      <p>
        Usamos os dados recebidos da Meta apenas para as finalidades descritas acima, em conformidade
        com os Termos da Plataforma Meta. Ao desconectar sua conta Meta no DashMonster, revogamos e
        apagamos o token correspondente. Você também pode revogar o acesso a qualquer momento nas
        configurações do seu Facebook/Instagram.
      </p>

      <H>8. Seus direitos (LGPD)</H>
      <p>
        Nos termos da Lei Geral de Proteção de Dados, você pode solicitar acesso, correção,
        portabilidade ou exclusão dos seus dados, e revogar consentimentos. Basta escrever para{" "}
        <a href="mailto:contato@dashmonster.com.br" className="underline">contato@dashmonster.com.br</a>.
      </p>

      <H>9. Alterações</H>
      <p>Podemos atualizar esta Política. Mudanças relevantes serão comunicadas pelo email de contato ou no próprio serviço.</p>
    </LegalLayout>
  );
}
